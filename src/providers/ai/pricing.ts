import type { AiUsage } from "./types";

/**
 * USD per million tokens, Anthropic first-party rates as documented on 2026-10-23.
 * Cache read/write rates for Haiku are the usual 10% / 125% of input; Sonnet and Opus cache reads
 * are documented at $0.20. Batch halves everything. Override via `setPricing` if rates change.
 */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const pricing: Record<string, ModelPricing> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "mock-cheap": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  "mock-strong": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export function getPricing(model: string): ModelPricing {
  return pricing[model] ?? pricing["claude-sonnet-5-5"]!;
}

export function setPricing(model: string, p: ModelPricing): void {
  pricing[model] = p;
}

/** Cost in micro-dollars (1e-6 USD) so sums stay integers. */
export function costMicros(model: string, usage: AiUsage, opts: { batched?: boolean } = {}): number {
  const p = getPricing(model);
  const perTok = (rate: number): number => rate / 1_000_000;
  const usd =
    usage.inputTokens * perTok(p.input) +
    usage.outputTokens * perTok(p.output) +
    usage.cacheReadTokens * perTok(p.cacheRead) +
    usage.cacheWriteTokens * perTok(p.cacheWrite);
  const discounted = opts.batched ? usd / 2 : usd;
  return Math.round(discounted * 1_000_000);
}

/** What the same tokens would cost on the strong model, realtime, with cache reads billed as fresh input (the savings baseline). */
export function naiveCostMicros(usage: AiUsage, strongModel = "claude-sonnet-5-5"): number {
  const p = getPricing(strongModel);
  const usd =
    ((usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens) * p.input + usage.outputTokens * p.output) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

export function formatUsd(micros: number): string {
  const usd = micros / 1_000_000;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
