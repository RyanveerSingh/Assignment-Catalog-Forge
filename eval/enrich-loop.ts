/**
 * The AI stage of the eval: the enrich job's request shape, batches of eight per tier and model,
 * retry with backoff, and one split into singles when a batch comes back without valid answers.
 */
import { buildEnrichSystemPrompt, renderEnrichUserText, type EnrichInput, type EnrichProductInput } from "@/core/ai/prompts";
import type { AiTier } from "@/core/ai/routing";
import { aiEnrichBatchSchema, type AiProductOutput } from "@/core/ai/schema";
import type { ProductGroup } from "@/core/types";
import { isAiError, type AiProvider, type AiResponse } from "@/providers/ai";
import type { CallRecord } from "./types";

const BATCH_SIZE = 8;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 2_000;
const MAX_TOKENS = 16_000;

export type RowCells = { row: number; cells: Record<string, string> };
export type Logger = (message: string) => void;
export type ModelAnswer = { output: AiProductOutput } | { error: string };

export interface Candidate {
  group: ProductGroup;
  rows: RowCells[];
  input: EnrichProductInput;
  tier: AiTier;
  model: string;
}

interface CallOutcome {
  outputs: Map<string, AiProductOutput>;
  error: string | null;
  /** Retrying or splitting cannot help (auth, billing, refusal, bad request). */
  fatal: boolean;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(id: string, batch: Candidate[], attempt: number, res: AiResponse<unknown> | null, error: string | null, latencyMs: number): CallRecord {
  return {
    batch: id,
    tier: batch[0].tier,
    model: batch[0].model,
    products: batch.length,
    attempt,
    ok: res !== null,
    error,
    inputTokens: res?.usage.inputTokens ?? 0,
    outputTokens: res?.usage.outputTokens ?? 0,
    cacheReadTokens: res?.usage.cacheReadTokens ?? 0,
    cacheWriteTokens: res?.usage.cacheWriteTokens ?? 0,
    costMicros: res?.costMicros ?? 0,
    latencyMs,
  };
}

async function callWithRetry(provider: AiProvider, batch: Candidate[], promptVersion: string, id: string, calls: CallRecord[]): Promise<CallOutcome> {
  const input: EnrichInput = { products: batch.map((c) => c.input) };
  const tier = batch[0].tier;
  const request = {
    purpose: "enrich" as const,
    model: batch[0].model,
    system: buildEnrichSystemPrompt(promptVersion),
    userText: renderEnrichUserText(input),
    input,
    schema: aiEnrichBatchSchema,
    maxTokens: MAX_TOKENS,
    effort: tier === "cheap" ? ("low" as const) : ("medium" as const),
    customId: id,
  };
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await provider.complete(request);
      calls.push(record(id, batch, attempt, res, null, res.latencyMs));
      return { outputs: new Map(res.output.products.map((o) => [o.product_key, o] as const)), error: null, fatal: false };
    } catch (err) {
      lastError = errorMessage(err);
      calls.push(record(id, batch, attempt, null, lastError, Date.now() - started));
      if (isAiError(err) && !err.retryable) return { outputs: new Map(), error: lastError, fatal: true };
      // A cut-off answer would be cut off again; let the caller split the batch instead of retrying it.
      if (isAiError(err) && err.kind === "max_tokens" && batch.length > 1) return { outputs: new Map(), error: lastError, fatal: false };
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS);
    }
  }
  return { outputs: new Map(), error: lastError, fatal: false };
}

export async function enrichAll(provider: AiProvider, candidates: Candidate[], promptVersion: string, calls: CallRecord[], log: Logger): Promise<Map<string, ModelAnswer>> {
  const answers = new Map<string, ModelAnswer>();
  const lanes = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const lane = `${c.tier}|${c.model}`;
    lanes.set(lane, [...(lanes.get(lane) ?? []), c]);
  }
  const total = [...lanes.values()].reduce((n, list) => n + Math.ceil(list.length / BATCH_SIZE), 0);
  let batchNo = 0;
  for (const list of lanes.values()) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      batchNo += 1;
      const id = `eval:${batchNo}`;
      log(`batch ${batchNo}/${total}: ${batch.length} product(s) via ${batch[0].tier} (${batch[0].model})`);
      const result = await callWithRetry(provider, batch, promptVersion, id, calls);
      const leftovers: Candidate[] = [];
      for (const c of batch) {
        const out = result.outputs.get(c.group.productKey);
        if (out) answers.set(c.group.productKey, { output: out });
        else leftovers.push(c);
      }
      if (leftovers.length === 0) continue;
      const reason = result.error ?? "the model returned no output for this product";
      if (result.fatal || batch.length === 1) {
        for (const c of leftovers) answers.set(c.group.productKey, { error: reason });
        continue;
      }
      // Invalid output for the batch (skipped or mislabelled products): split into singles, once.
      log(`batch ${batchNo}: ${leftovers.length} product(s) without a valid answer (${reason}); retrying one at a time`);
      for (const c of leftovers) {
        const single = await callWithRetry(provider, [c], promptVersion, `${id}:${c.group.productKey}`, calls);
        const out = single.outputs.get(c.group.productKey);
        answers.set(c.group.productKey, out ? { output: out } : { error: single.error ?? "the model returned no output for this product" });
      }
    }
  }
  return answers;
}
