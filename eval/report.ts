/**
 * Plain-text report for the terminal: header, metrics table, the worst products, cost and latency.
 */
import { failingChecks, worstProducts } from "./metrics";
import type { EvalRunResult } from "./types";

const LABEL_WIDTH = 26;
const VALUE_WIDTH = 9;
const WORST_COUNT = 10;

export function pct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function duration(ms: number): string {
  return ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function row(label: string, value: string, detail = ""): string {
  return `  ${label.padEnd(LABEL_WIDTH)}${value.padStart(VALUE_WIDTH)}  ${detail}`.trimEnd();
}

export function formatReport(r: EvalRunResult): string {
  const m = r.metrics;
  const c = r.cost;
  const cal = m.confidenceCalibration;
  const lines: string[] = [];

  const provider = r.config.provider === r.config.requestedProvider ? r.config.provider : `${r.config.provider} (requested ${r.config.requestedProvider})`;
  lines.push(`CatalogForge eval: ${r.config.sample}`);
  lines.push(`  provider ${provider} | model ${r.config.model} | prompt ${r.config.promptVersion} | tier ${r.config.tier}${r.config.limit !== null ? ` | limit ${r.config.limit}` : ""}`);
  lines.push(
    `  rows ${r.counts.rows} | products ${r.counts.derivedProducts} derived, ${r.counts.truthProducts} truth, ${r.counts.matched} matched | calls ${r.counts.calls}${r.counts.failedProducts > 0 ? ` | failed products ${r.counts.failedProducts}` : ""}`,
  );
  if (r.config.note) lines.push(`  note: ${r.config.note}`);

  lines.push("");
  lines.push(row("Metric", "Value", "Detail"));
  lines.push(row("product recall", pct(m.productRecall), `${m.products.matched}/${m.products.truth} truth products matched`));
  lines.push(row("product precision", pct(m.productPrecision), `${m.products.matched}/${m.products.derived} derived products matched`));
  lines.push(row("variant precision", pct(m.variantPrecision), "derived SKUs that exist in the truth"));
  lines.push(row("variant recall", pct(m.variantRecall), "truth SKUs the pipeline recovered"));
  lines.push(row("price exactness", pct(m.priceExactness), "truth variants with identical cents and currency"));
  lines.push(row("title keyword rate", pct(m.titleKeywordRate), "mean share of title keywords present"));
  lines.push(row("category accuracy", pct(m.categoryAccuracy), "category under the expected prefix"));
  lines.push(row("claim precision", pct(m.claimPrecision), "output claims inside allowedClaims"));
  lines.push(row("claim recall", pct(m.claimRecall), "allowedClaims covered by output claims"));
  lines.push(row("negated violations", String(m.negatedViolations), m.negatedViolations === 0 ? "hard rule: must be 0" : "HARD RULE BROKEN (exit code 1)"));
  lines.push(row("review precision", pct(m.reviewPrecision), "needs_review flags that were expected"));
  lines.push(row("review recall", pct(m.reviewRecall), "expected needs_review products that were flagged"));
  lines.push(row("review reason hit", pct(m.reviewReasonRate), "expected reason class reflected in the reasons"));
  lines.push(row("status accuracy", pct(m.statusAccuracy), "draft = done, needs_review = needs_review"));
  lines.push(row("duplicate precision", pct(m.duplicatePrecision), "detected duplicate rows that are real"));
  lines.push(row("duplicate recall", pct(m.duplicateRecall), "real duplicate rows detected"));
  lines.push(row("confidence when correct", pct(cal.meanConfidenceWhenCorrect), `mean title confidence over ${cal.correct} product(s) with keyword hit >= 0.5`));
  lines.push(row("confidence when wrong", pct(cal.meanConfidenceWhenWrong), `mean title confidence over ${cal.wrong} product(s) below 0.5`));

  lines.push("");
  lines.push(`Worst ${WORST_COUNT} products (negated violations desc, title keyword hit asc)`);
  const worst = worstProducts(r.products, WORST_COUNT);
  if (worst.length === 0) lines.push("  (no matched products)");
  for (const p of worst) {
    lines.push(`  ${truncate(p.productKey, 24).padEnd(24)} ${truncate(p.title || "(no listing)", 60)}`);
    const checks = failingChecks(p);
    if (checks.length === 0) lines.push("      all checks passed");
    for (const check of checks) lines.push(`      - ${truncate(check, 130)}`);
  }

  lines.push("");
  lines.push("Cost and latency");
  lines.push(row("model calls", count(c.calls), c.failedCalls > 0 ? `${c.failedCalls} failed attempt(s)` : ""));
  lines.push(row("input tokens", count(c.inputTokens), `cache read ${count(c.cacheReadTokens)}, cache write ${count(c.cacheWriteTokens)}`));
  lines.push(row("output tokens", count(c.outputTokens)));
  lines.push(row("cost", usd(c.costMicros), r.config.provider === "mock" ? "the mock provider is free" : ""));
  lines.push(row("model latency", duration(c.modelLatencyMs), c.meanLatencyMs !== null ? `mean ${duration(c.meanLatencyMs)} per successful call` : ""));
  lines.push(row("pipeline (no AI)", duration(c.pipelineMs), "parse, clean, group"));
  lines.push(row("total elapsed", duration(c.elapsedMs)));

  if (r.outFile) {
    lines.push("");
    lines.push(`Wrote ${r.outFile}`);
  }
  if (r.evalRunId) lines.push(`Stored eval_runs row ${r.evalRunId}`);
  return lines.join("\n");
}
