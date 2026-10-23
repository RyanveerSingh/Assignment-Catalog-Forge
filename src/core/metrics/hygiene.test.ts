import { describe, expect, it } from "vitest";
import { AI_TIER_ORDER, buildHygieneReport, hygieneStageFor, share, type HygieneCounts, type HygieneStage } from "./hygiene";

/** Shaped like the finished 1,000-row real-model import: 30 duplicate rows, two SKU conflicts, 116 near-duplicates. */
function counts(overrides: Partial<HygieneCounts> = {}): HygieneCounts {
  return {
    rows: { parsed: 1000, duplicates: 30, cleaned: 1000, clean: 320, repaired: 655, flagged: 25, priced: 997, weighed: 987, dimensioned: 1000, measured: 1000 },
    codes: {
      "dimensions.order_assumed": 635,
      "price.currency_unrecognised": 13,
      "language.non_english": 9,
      "unit.assumed": 3,
      "color.fuzzy_match": 3,
      "price.missing": 2,
      "text.mojibake_repaired": 1,
      "html.unsafe_removed": 1,
      "description.truncated": 1,
    },
    products: { total: 477, variants: 968, conflicts: 2, possibleDuplicates: 116, conflictsOrDuplicates: 117, byTier: { cheap: 475, strong: 2 }, byStatus: { draft: 446, needs_review: 31 }, claims: 2540 },
    ai: { calls: 62, cached: 0 },
    claimsBlocked: 14,
    ...overrides,
  };
}

function stage(report: ReturnType<typeof buildHygieneReport>, key: HygieneStage["key"]): HygieneStage {
  const found = report.stages.find((s) => s.key === key);
  if (!found) throw new Error(`stage ${key} missing`);
  return found;
}

function itemValue(s: HygieneStage, key: string): number {
  for (const i of s.items) {
    if (i.key === key) return i.value;
    const child = i.children?.find((c) => c.key === key);
    if (child) return child.value;
  }
  throw new Error(`item ${key} missing from ${s.key}`);
}

describe("share", () => {
  it.each([
    [0, 0, 0],
    [5, 0, 0],
    [-1, 10, 0],
    [3, 10, 0.3],
    [15, 10, 1],
  ])("share(%d, %d) is %d: never NaN, never above 1", (part, whole, expected) => {
    expect(share(part, whole)).toBe(expected);
  });
});

describe("buildHygieneReport", () => {
  it("EC-J9: lists the five stages in pipeline order with the counts the database gave", () => {
    const report = buildHygieneReport(counts());
    expect(report.stages.map((s) => s.key)).toEqual(["ingest", "cleaning", "grouping", "routing", "grounding"]);
    expect(stage(report, "ingest").headline).toEqual({ value: 1000, unit: "rows parsed" });
    expect(stage(report, "cleaning").headline.value).toBe(1000);
    expect(stage(report, "grouping").headline.value).toBe(477);
    expect(stage(report, "routing").headline.value).toBe(477);
    expect(stage(report, "grounding").headline).toEqual({ value: 2540, unit: "claims verified" });
  });

  it("EC-J9: every bar partitions its stage: segment values add up to the headline and shares sum to one", () => {
    const report = buildHygieneReport(counts());
    for (const s of report.stages) {
      const whole = s.key === "grounding" ? 477 : s.headline.value;
      const values = s.bar.reduce((n, seg) => n + seg.value, 0);
      const shares = s.bar.reduce((n, seg) => n + seg.share, 0);
      expect(values, s.key).toBe(whole);
      expect(shares, s.key).toBeCloseTo(1, 6);
      expect(s.bar.every((seg) => seg.value > 0), `${s.key} drops empty segments`).toBe(true);
    }
  });

  it("EC-J9: an import that has not been parsed yet shows zero headlines, no bars and no NaN", () => {
    const report = buildHygieneReport(
      counts({
        rows: { parsed: 0, duplicates: 0, cleaned: 0, clean: 0, repaired: 0, flagged: 0, priced: 0, weighed: 0, dimensioned: 0, measured: 0 },
        codes: {},
        products: { total: 0, variants: 0, conflicts: 0, possibleDuplicates: 0, conflictsOrDuplicates: 0, byTier: {}, byStatus: {}, claims: 0 },
        ai: { calls: 0, cached: 0 },
        claimsBlocked: 0,
      }),
    );
    for (const s of report.stages) {
      expect(s.headline.value).toBe(0);
      expect(s.bar).toEqual([]);
      expect(s.empty.length).toBeGreaterThan(0);
      for (const i of s.items) {
        expect(Number.isFinite(i.value), `${s.key}/${i.key}`).toBe(true);
        for (const c of i.children ?? []) expect(Number.isFinite(c.value)).toBe(true);
      }
    }
  });

  it("EC-J9: raw ingest separates unique rows from exact duplicates that were collapsed", () => {
    const s = stage(buildHygieneReport(counts()), "ingest");
    expect(itemValue(s, "unique")).toBe(970);
    expect(itemValue(s, "duplicates")).toBe(30);
    expect(s.bar.map((b) => [b.key, b.value])).toEqual([
      ["unique", 970],
      ["duplicates", 30],
    ]);
  });

  it("EC-J9: cleaning reads each repair from its issue code and treats a missing code as zero", () => {
    const s = stage(buildHygieneReport(counts()), "cleaning");
    expect(itemValue(s, "mojibake")).toBe(1);
    expect(itemValue(s, "unsafe_html")).toBe(1);
    expect(itemValue(s, "tags")).toBe(0);
    expect(itemValue(s, "prices")).toBe(997);
    expect(itemValue(s, "price_currency")).toBe(13);
    expect(itemValue(s, "price_missing")).toBe(2);
    expect(itemValue(s, "price_ambiguous")).toBe(0);
    expect(itemValue(s, "units")).toBe(1000);
    expect(itemValue(s, "order_assumed")).toBe(635);
    expect(itemValue(s, "colour")).toBe(3);
    expect(itemValue(s, "language")).toBe(9);
    expect(itemValue(s, "truncated")).toBe(1);
  });

  it("EC-J9: grouping gives SKU conflicts precedence over possible duplicates so one product is drawn once", () => {
    const s = stage(buildHygieneReport(counts()), "grouping");
    expect(s.bar.map((b) => [b.key, b.value])).toEqual([
      ["clean", 360],
      ["duplicates", 115],
      ["conflicts", 2],
    ]);
    expect(itemValue(s, "possible_duplicates")).toBe(116);
    expect(itemValue(s, "variants")).toBe(968);
    expect(itemValue(s, "rows")).toBe(970);
  });

  it("EC-J9: routing orders tiers cheap, strong, vision, escalation and keeps an unknown tier visible", () => {
    const s = stage(buildHygieneReport(counts({ products: { ...counts().products, byTier: { strong: 2, cheap: 470, escalation: 1, experimental: 4 } } })), "routing");
    expect(s.bar.map((b) => b.key)).toEqual(["cheap", "strong", "escalation", "experimental"]);
    expect(s.headline.value).toBe(477);
    expect(AI_TIER_ORDER.map((t) => t.key)).toEqual(["cheap", "strong", "vision", "escalation", "unrouted"]);
    expect(s.items.some((i) => i.key === "unrouted")).toBe(false);
  });

  it("EC-J9: routing never reports more cached answers than calls", () => {
    const s = stage(buildHygieneReport(counts({ ai: { calls: 3, cached: 9 } })), "routing");
    expect(itemValue(s, "calls")).toBe(3);
    expect(itemValue(s, "cached")).toBe(3);
  });

  it("EC-J9: the grounding gate counts draft, review and failed products, and shows pending only while the model is still running", () => {
    const done = stage(buildHygieneReport(counts()), "grounding");
    expect(itemValue(done, "passed")).toBe(446);
    expect(itemValue(done, "review")).toBe(31);
    expect(itemValue(done, "failed")).toBe(0);
    expect(itemValue(done, "blocked")).toBe(14);
    expect(done.items.some((i) => i.key === "pending")).toBe(false);

    const running = stage(buildHygieneReport(counts({ products: { ...counts().products, byStatus: { draft: 100, needs_review: 7, failed: 2, pending_ai: 368 } } })), "grounding");
    expect(itemValue(running, "pending")).toBe(368);
    expect(running.bar.map((b) => [b.key, b.value])).toEqual([
      ["passed", 100],
      ["review", 7],
      ["failed", 2],
      ["pending", 368],
    ]);
  });

  it("EC-J9: approved products still count as having passed the gate", () => {
    const s = stage(buildHygieneReport(counts({ products: { ...counts().products, byStatus: { draft: 400, approved: 46, needs_review: 31 } } })), "grounding");
    expect(itemValue(s, "passed")).toBe(446);
  });
});

describe("hygieneStageFor", () => {
  it.each([
    ["parsing", "ingest"],
    ["cleaning", "cleaning"],
    ["grouping", "grouping"],
    ["enriching", "routing"],
    ["validating", "grounding"],
    ["translating", null],
    ["completed", null],
    ["paused", null],
  ])("maps import status %s to %s", (status, expected) => {
    expect(hygieneStageFor(status)).toBe(expected);
  });
});
