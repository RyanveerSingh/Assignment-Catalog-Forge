/**
 * Prices a store's recorded AI usage four ways: the naive baseline, routing alone, what was really
 * spent, and the same work through the Batch API. Rates are USD per million tokens, so one token at
 * a rate costs exactly `rate` micro-dollars and the sums stay integers. Pure: callers supply rates.
 */

export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** One (model, batched) bucket of succeeded calls, as the metrics repository aggregates them. */
export interface ModelUsage {
  model: string;
  batched: boolean;
  calls: number;
  /** Calls answered from the response cache: no tokens, no cost. */
  cachedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
}

export type StrategyKey = "naive" | "routed" | "actual" | "economy";

export interface CostStrategyRow {
  key: StrategyKey;
  calls: number;
  costMicros: number;
  /** null when no product has been through the AI yet. */
  per1000Micros: number | null;
  savedMicros: number;
  /** 0–1 share of the naive baseline saved. */
  savedShare: number;
}

export interface CostStrategies {
  rows: CostStrategyRow[];
  /** True when any model is the demo provider's; its costs are estimates at list rates. */
  demo: boolean;
  productsThroughAi: number;
  totalCalls: number;
  cachedCalls: number;
  batchedCalls: number;
}

export interface CostStrategyOptions {
  rates: (model: string) => ModelRates;
  /** The model the naive baseline prices everything at. */
  strongModel: string;
  productsThroughAi: number;
}

export const DEMO_MODEL_PREFIX = "mock-";

export function isDemoModel(model: string): boolean {
  return model.startsWith(DEMO_MODEL_PREFIX);
}

/** Realtime list price of a bucket with the prompt cache applied. */
function listMicros(u: ModelUsage, p: ModelRates): number {
  return u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite;
}

/** The same tokens with every input token, cached or not, billed as fresh input. */
function uncachedMicros(u: ModelUsage, p: ModelRates): number {
  return (u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens) * p.input + u.outputTokens * p.output;
}

export function computeCostStrategies(usage: ModelUsage[], opts: CostStrategyOptions): CostStrategies {
  const strong = opts.rates(opts.strongModel);
  let naive = 0;
  let routed = 0;
  let actual = 0;
  let economy = 0;
  let totalCalls = 0;
  let cachedCalls = 0;
  let batchedCalls = 0;
  let demo = false;

  for (const u of usage) {
    const p = opts.rates(u.model);
    const isDemo = isDemoModel(u.model);
    demo = demo || isDemo;
    naive += uncachedMicros(u, strong);
    routed += uncachedMicros(u, p);
    // The demo provider records tokens but never a price, so its real spend is the list estimate.
    const spent = isDemo ? (u.batched ? listMicros(u, p) / 2 : listMicros(u, p)) : u.costMicros;
    actual += spent;
    // Calls that already went through the Batch API are not halved twice.
    economy += u.batched ? spent : spent / 2;
    totalCalls += u.calls;
    cachedCalls += Math.min(u.cachedCalls, u.calls);
    if (u.batched) batchedCalls += u.calls;
  }

  const liveCalls = Math.max(0, totalCalls - cachedCalls);
  const row = (key: StrategyKey, calls: number, cost: number): CostStrategyRow => {
    const costMicros = Math.round(cost);
    const base = Math.round(naive);
    const savedMicros = Math.max(0, base - costMicros);
    return {
      key,
      calls,
      costMicros,
      per1000Micros: opts.productsThroughAi > 0 ? Math.round((costMicros / opts.productsThroughAi) * 1000) : null,
      savedMicros,
      savedShare: base > 0 ? savedMicros / base : 0,
    };
  };

  return {
    rows: [row("naive", totalCalls, naive), row("routed", totalCalls, routed), row("actual", liveCalls, actual), row("economy", liveCalls, economy)],
    demo,
    productsThroughAi: Math.max(0, opts.productsThroughAi),
    totalCalls,
    cachedCalls,
    batchedCalls,
  };
}
