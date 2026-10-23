import { describe, expect, it } from "vitest";
import { computeCostStrategies, isDemoModel, type CostStrategyRow, type ModelRates, type ModelUsage } from "./cost-strategies";

const HAIKU: ModelRates = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
const SONNET: ModelRates = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

function rates(model: string): ModelRates {
  if (model === "claude-haiku-5-5" || model === "mock-cheap") return HAIKU;
  return SONNET;
}

function usage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return { model: "claude-haiku-5-5", batched: false, calls: 10, cachedCalls: 0, inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 200, costMicros: 180, ...overrides };
}

function row(result: ReturnType<typeof computeCostStrategies>, key: CostStrategyRow["key"]): CostStrategyRow {
  const found = result.rows.find((r) => r.key === key);
  if (!found) throw new Error(`row ${key} missing`);
  return found;
}

const opts = { rates, strongModel: "claude-sonnet-5-5", productsThroughAi: 50 };

describe("computeCostStrategies", () => {
  it("EC-J10: lists the four strategies in order", () => {
    expect(computeCostStrategies([usage()], opts).rows.map((r) => r.key)).toEqual(["naive", "routed", "actual", "economy"]);
  });

  it("EC-J10: the Sonnet-everywhere baseline bills cache reads and writes as fresh Sonnet input", () => {
    // (1000 + 500 + 200) input tokens at $2/MTok + 100 output at $10/MTok, in micro-dollars.
    expect(row(computeCostStrategies([usage()], opts), "naive").costMicros).toBe(1700 * 2 + 100 * 10);
  });

  it("EC-J10: the routed row keeps the real model but still bills cache reads as fresh input", () => {
    expect(row(computeCostStrategies([usage()], opts), "routed").costMicros).toBe(Math.round(1700 * 0.1 + 100 * 0.5));
  });

  it("EC-J10: the actual row is the recorded spend, not a re-computation", () => {
    expect(row(computeCostStrategies([usage({ costMicros: 123 })], opts), "actual").costMicros).toBe(123);
  });

  it("EC-J10: economy halves realtime calls and leaves calls that already went through the Batch API alone", () => {
    const result = computeCostStrategies([usage({ costMicros: 200 }), usage({ batched: true, costMicros: 100, calls: 4 })], opts);
    expect(row(result, "actual").costMicros).toBe(300);
    expect(row(result, "economy").costMicros).toBe(200);
    expect(result.batchedCalls).toBe(4);
  });

  it("EC-J10: the baseline and routed rows count every answer as a call; actual and economy leave out response-cache hits", () => {
    const result = computeCostStrategies([usage({ calls: 10, cachedCalls: 3 })], opts);
    expect(row(result, "naive").calls).toBe(10);
    expect(row(result, "routed").calls).toBe(10);
    expect(row(result, "actual").calls).toBe(7);
    expect(row(result, "economy").calls).toBe(7);
    expect(result.cachedCalls).toBe(3);
  });

  it("EC-J10: savings are measured against the baseline and never go negative", () => {
    const result = computeCostStrategies([usage({ costMicros: 180 })], opts);
    const naive = row(result, "naive");
    expect(naive.savedMicros).toBe(0);
    expect(naive.savedShare).toBe(0);
    const actual = row(result, "actual");
    expect(actual.savedMicros).toBe(4400 - 180);
    expect(actual.savedShare).toBeCloseTo((4400 - 180) / 4400, 6);
    const dearer = computeCostStrategies([usage({ model: "claude-sonnet-5-5", costMicros: 9_999_999 })], opts);
    expect(row(dearer, "actual").savedMicros).toBe(0);
  });

  it("EC-J10: per 1,000 products divides by the products that went through the AI, or stays empty when none did", () => {
    expect(row(computeCostStrategies([usage({ costMicros: 500 })], opts), "actual").per1000Micros).toBe(10_000);
    expect(row(computeCostStrategies([usage()], { ...opts, productsThroughAi: 0 }), "actual").per1000Micros).toBeNull();
  });

  it("EC-J10: the demo provider is priced at the mapped list rates and flagged, since it records tokens but no cost", () => {
    const result = computeCostStrategies([usage({ model: "mock-cheap", costMicros: 0 })], opts);
    expect(result.demo).toBe(true);
    expect(row(result, "actual").costMicros).toBe(Math.round(1000 * 0.1 + 100 * 0.5 + 500 * 0.01 + 200 * 0.125));
    expect(row(result, "economy").costMicros).toBe(Math.round((1000 * 0.1 + 100 * 0.5 + 500 * 0.01 + 200 * 0.125) / 2));
    expect(computeCostStrategies([usage()], opts).demo).toBe(false);
  });

  it("EC-J10: no usage at all gives zero rows without NaN", () => {
    const result = computeCostStrategies([], opts);
    for (const r of result.rows) {
      expect(r.costMicros).toBe(0);
      expect(r.calls).toBe(0);
      expect(r.savedShare).toBe(0);
      expect(r.per1000Micros).toBe(0);
    }
    expect(result.totalCalls).toBe(0);
  });

  it("sums several models and both batch modes into one table", () => {
    const result = computeCostStrategies([usage({ costMicros: 100 }), usage({ model: "claude-sonnet-5-5", calls: 2, costMicros: 900, cacheReadTokens: 0, cacheWriteTokens: 0 })], opts);
    expect(result.totalCalls).toBe(12);
    expect(row(result, "actual").costMicros).toBe(1000);
    expect(row(result, "naive").costMicros).toBe(4400 + (1000 * 2 + 100 * 10));
  });
});

describe("isDemoModel", () => {
  it.each([
    ["mock-cheap", true],
    ["mock-strong", true],
    ["claude-haiku-5-5", false],
  ])("%s → %s", (model, expected) => {
    expect(isDemoModel(model)).toBe(expected);
  });
});
