/**
 * Evaluation harness: the deterministic pipeline, the AI stage and grounding on a sample sheet,
 * scored against the ground truth that was generated with it.
 *
 *   npx tsx eval/run.ts --sample messy-120 [--provider mock|anthropic] [--prompt v1]
 *                       [--tier auto|cheap|strong] [--limit N] [--store[=<storeId>]] [--out eval/out]
 *
 * Nothing touches the products tables; `--store` inserts one row into eval_runs and nothing else.
 * Exit code 1 when a listing asserts a claim the source negates (EC-B15), the one hard rule.
 */
import "@/lib/env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groundProductOutput } from "@/core/ai/grounding";
import { PROMPT_VERSION } from "@/core/ai/prompts";
import { routeTier, type AiTier } from "@/core/ai/routing";
import { htmlToText } from "@/core/clean/html";
import { buildEnrichProductInput } from "@/jobs/enrich-input";
import { getConfig } from "@/lib/config";
import { getAiProvider, modelForTier, type AiProvider } from "@/providers/ai";
import { createMockProvider } from "@/providers/ai/mock";
import { DEFAULT_CURRENCY, loadSample, runDeterministic } from "./deterministic";
import { type Candidate, enrichAll, errorMessage, type Logger, type ModelAnswer } from "./enrich-loop";
import { aggregate, matchProducts, scoreDuplicates, scorePair, type DerivedProduct } from "./metrics";
import { formatReport } from "./report";
import type { CallRecord, CostSummary, EvalOptions, EvalProvider, EvalRunResult, EvalTier } from "./types";

const DEFAULT_OUT_DIR = path.join(process.cwd(), "eval", "out");

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProviderChoice {
  provider: AiProvider;
  mode: EvalProvider;
  note: string | null;
}

function resolveProvider(requested: EvalProvider): ProviderChoice {
  const cfg = getConfig();
  if (requested === "anthropic") {
    if (cfg.ANTHROPIC_API_KEY) {
      const { provider, mode } = getAiProvider(cfg.ANTHROPIC_API_KEY);
      return { provider, mode, note: null };
    }
    return { ...mockProvider(), note: "ANTHROPIC_API_KEY is not set (add it to .env.local with AI_PROVIDER=anthropic); the mock provider ran instead" };
  }
  return { ...mockProvider(), note: null };
}

/** getAiProvider() hands back the server key whenever AI_PROVIDER=anthropic; asked for the mock, we mean the mock. */
function mockProvider(): { provider: AiProvider; mode: "mock" } {
  if (getConfig().AI_PROVIDER === "anthropic") return { provider: createMockProvider(), mode: "mock" };
  return { provider: getAiProvider(null).provider, mode: "mock" };
}

// ---------------------------------------------------------------------------
// Grounding → derived product
// ---------------------------------------------------------------------------

function toDerived(c: Candidate, answer: ModelAnswer | undefined): DerivedProduct {
  const base = {
    productKey: c.group.productKey,
    skus: c.group.variants.map((v) => v.sku),
    variants: c.group.variants.map((v) => ({ sku: v.sku, synthetic: v.synthetic, priceCents: v.priceCents, currency: v.currency })),
  };
  const failed = (error: string): DerivedProduct => ({ ...base, blocked: [], title: "", category: "", claims: [], descriptionText: "", tags: [], attributes: {}, status: "failed", reviewReasons: [], confidence: {}, error });
  if (!answer) return failed("no model answer");
  if ("error" in answer) return failed(answer.error);
  try {
    const g = groundProductOutput({ output: answer.output, group: c.group, rows: c.rows });
    return {
      ...base,
      title: g.content.title,
      category: g.content.category,
      claims: g.claims.map((claim) => claim.text),
      blocked: g.blocked.map((b) => `${b.kind}: "${b.text}" — ${b.reason}${b.quote ? ` (source: "${b.quote}")` : ""}`),
      descriptionText: g.content.descriptionHtml ? htmlToText(g.content.descriptionHtml) : "",
      tags: g.content.tags,
      attributes: g.content.attributes,
      status: g.status,
      reviewReasons: g.reviewReasons,
      confidence: g.confidence,
    };
  } catch (err) {
    return failed(`grounding threw: ${errorMessage(err)}`);
  }
}

function summarizeCost(calls: CallRecord[], pipelineMs: number, elapsedMs: number): CostSummary {
  const sum = (pick: (c: CallRecord) => number): number => calls.reduce((n, c) => n + pick(c), 0);
  const ok = calls.filter((c) => c.ok);
  const costMicros = sum((c) => c.costMicros);
  return {
    calls: calls.length,
    failedCalls: calls.length - ok.length,
    inputTokens: sum((c) => c.inputTokens),
    outputTokens: sum((c) => c.outputTokens),
    cacheReadTokens: sum((c) => c.cacheReadTokens),
    cacheWriteTokens: sum((c) => c.cacheWriteTokens),
    costMicros,
    costUsd: costMicros / 1_000_000,
    modelLatencyMs: sum((c) => c.latencyMs),
    meanLatencyMs: ok.length === 0 ? null : ok.reduce((n, c) => n + c.latencyMs, 0) / ok.length,
    pipelineMs,
    elapsedMs,
  };
}

// ---------------------------------------------------------------------------
// eval_runs (optional; imported lazily so a plain run never opens a pool)
// ---------------------------------------------------------------------------

async function storeRun(result: EvalRunResult, storeId: string | null, log: Logger): Promise<string | null> {
  if (!process.env.DATABASE_URL) {
    log("--store: DATABASE_URL is not set; skipping the eval_runs insert");
    return null;
  }
  const { getDb, closeDb } = await import("@/db/client");
  const { evalRuns } = await import("@/db/schema");
  try {
    const [row] = await getDb()
      .insert(evalRuns)
      .values({
        storeId,
        name: `${result.config.sample} / ${result.config.provider} / ${result.config.promptVersion}`,
        promptVersion: result.config.promptVersion,
        model: result.config.model,
        sample: result.config.sample,
        metrics: { ...result.metrics, config: result.config, counts: result.counts, cost: result.cost, outFile: result.outFile },
      })
      .returning({ id: evalRuns.id });
    return row?.id ?? null;
  } catch (err) {
    log(`--store: could not insert into eval_runs (${errorMessage(err)}); the JSON file still has everything`);
    return null;
  } finally {
    await closeDb();
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function runEval(options: EvalOptions): Promise<EvalRunResult> {
  const startedAt = new Date();
  const requested: EvalProvider = options.provider ?? "mock";
  const promptVersion = options.prompt ?? PROMPT_VERSION;
  const tierChoice: EvalTier = options.tier ?? "auto";
  const limit = options.limit ?? null;
  const log: Logger = options.quiet ? () => undefined : (message) => console.log(message);

  const { file, buffer, truth } = loadSample(options.sample);
  const det = runDeterministic(buffer, file, limit);
  const pipelineMs = Date.now() - startedAt.getTime();
  log(`${path.basename(file)}: ${det.rows} rows → ${det.groups.length} products, ${det.duplicates.length} duplicate rows (${pipelineMs} ms)`);

  const ai = resolveProvider(requested);
  if (ai.note) log(`note: ${ai.note}`);
  const candidates: Candidate[] = det.groups.map((group) => {
    const routed = tierChoice === "auto" ? routeTier(group, 0).tier : tierChoice;
    const tier: AiTier = routed === "vision" ? "strong" : routed;
    const rows = group.sourceRows.map((row) => ({ row, cells: det.cellsByRow.get(row) ?? {} }));
    return { group, rows, input: buildEnrichProductInput(group, rows, []), tier, model: modelForTier(tier, ai.mode) };
  });
  const calls: CallRecord[] = [];
  const answers = await enrichAll(ai.provider, candidates, promptVersion, calls, log);
  const derived = candidates.map((c) => toDerived(c, answers.get(c.group.productKey)));

  const truthProducts = limit === null ? truth.products : truth.products.filter((p) => p.sourceRows.some((r) => det.keptRows.has(r)));
  const truthDuplicates = limit === null ? truth.duplicateRows : truth.duplicateRows.filter((d) => det.keptRows.has(d.of));
  const match = matchProducts(derived, truthProducts);
  const scored = match.pairs.map((p) => scorePair(p.derived, p.truth));
  const duplicates = scoreDuplicates(det.duplicates, truthDuplicates);
  const metrics = aggregate(scored, { truth: match.unmatchedTruth, derived: match.unmatchedDerived }, duplicates);

  const models = [...new Set(candidates.map((c) => c.model))].sort();
  const result: EvalRunResult = {
    config: {
      sample: options.sample,
      file: path.relative(process.cwd(), file),
      provider: ai.mode,
      requestedProvider: requested,
      models,
      model: models.join("+") || "none",
      promptVersion,
      tier: tierChoice,
      limit,
      defaultCurrency: DEFAULT_CURRENCY,
      startedAt: startedAt.toISOString(),
      note: ai.note,
    },
    counts: { rows: det.rows, derivedProducts: derived.length, truthProducts: truthProducts.length, matched: scored.length, failedProducts: derived.filter((d) => d.error).length, calls: calls.length },
    metrics,
    products: scored,
    routing: candidates.map((c) => ({ productKey: c.group.productKey, keySource: c.group.keySource, complexity: c.group.complexity, tier: c.tier, model: c.model })),
    unmatchedTruth: match.unmatchedTruth.map((t) => ({ productKey: t.productKey, skus: t.variants.map((v) => v.sku) })),
    unmatchedDerived: match.unmatchedDerived.map((d) => ({ productKey: d.productKey, skus: d.skus, title: d.title, error: d.error ?? null })),
    duplicates: { derived: det.duplicates, truth: truthDuplicates, missed: duplicates.missed, extra: duplicates.extra },
    calls,
    cost: summarizeCost(calls, pipelineMs, Date.now() - startedAt.getTime()),
    outFile: null,
    evalRunId: null,
  };

  const outDir = options.outDir === undefined ? DEFAULT_OUT_DIR : options.outDir;
  if (outDir !== null) {
    mkdirSync(outDir, { recursive: true });
    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const outFile = path.join(outDir, `${options.sample}-${ai.mode}-${result.config.model}-${promptVersion}-${stamp}.json`);
    result.outFile = path.relative(process.cwd(), outFile);
    writeFileSync(outFile, JSON.stringify(result, null, 2));
  }
  if (options.store) result.evalRunId = await storeRun(result, typeof options.store === "string" ? options.store : null, log);
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = "usage: npx tsx eval/run.ts --sample <name> [--provider mock|anthropic] [--prompt v1] [--tier auto|cheap|strong] [--limit N] [--store[=<storeId>]] [--out <dir>] [--quiet]";
const VALUE_FLAGS: ReadonlySet<string> = new Set(["--sample", "--provider", "--prompt", "--tier", "--limit", "--out"]);

export function parseArgs(argv: string[]): EvalOptions {
  const opts: EvalOptions = { sample: "messy-120" };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=", 2);
    if (flag === "--store") {
      opts.store = inline ?? true;
      continue;
    }
    if (flag === "--quiet") {
      opts.quiet = true;
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`unknown argument ${flag}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    switch (flag) {
      case "--sample":
        opts.sample = value;
        break;
      case "--provider":
        if (value !== "mock" && value !== "anthropic") throw new Error(`--provider must be mock or anthropic, got ${value}`);
        opts.provider = value;
        break;
      case "--prompt":
        opts.prompt = value;
        break;
      case "--tier":
        if (value !== "auto" && value !== "cheap" && value !== "strong") throw new Error(`--tier must be auto, cheap or strong, got ${value}`);
        opts.tier = value;
        break;
      case "--limit": {
        const n = Number.parseInt(value, 10);
        if (!Number.isInteger(n) || n <= 0) throw new Error(`--limit must be a positive integer, got ${value}`);
        opts.limit = n;
        break;
      }
      case "--out":
        opts.outDir = value;
        break;
    }
  }
  return opts;
}

const invokedDirectly = /[\\/]eval[\\/]run\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  let options: EvalOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(errorMessage(err));
    console.error(USAGE);
    process.exit(2);
  }
  runEval(options)
    .then((result) => {
      console.log("");
      console.log(formatReport(result));
      process.exitCode = result.metrics.negatedViolations > 0 ? 1 : 0;
    })
    .catch((err: unknown) => {
      console.error(errorMessage(err));
      process.exitCode = 1;
    });
}
