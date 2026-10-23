/**
 * Shapes one import's pipeline counts into the five-stage "data hygiene" flow the import page draws.
 * Pure: every number is a count the repository took from the tables of record; nothing is estimated,
 * and a stage that has not run yet simply shows zero.
 */

export type HygieneTone = "good" | "changed" | "notice" | "bad" | "muted";
export type HygieneStageKey = "ingest" | "cleaning" | "grouping" | "routing" | "grounding";

export interface HygieneSegment {
  key: string;
  label: string;
  value: number;
  /** 0–1 share of the stage headline; zero-value segments are dropped. */
  share: number;
  tone: HygieneTone;
}

export interface HygieneItem {
  key: string;
  label: string;
  value: number;
  /** Set when the item is also a bar segment, so the UI can draw the matching swatch. */
  tone?: HygieneTone;
  children?: HygieneItem[];
}

export interface HygieneStage {
  key: HygieneStageKey;
  label: string;
  headline: { value: number; unit: string };
  bar: HygieneSegment[];
  items: HygieneItem[];
  /** Shown instead of the bar while the headline is still zero. */
  empty: string;
}

export interface HygieneReport {
  stages: HygieneStage[];
}

/** Raw counts straight from SQL. Codes map an issue code to the number of rows carrying it at least once. */
export interface HygieneCounts {
  rows: {
    parsed: number;
    duplicates: number;
    cleaned: number;
    /** Cleaned rows with no issue at all. */
    clean: number;
    /** Cleaned rows with only info-level issues (something was repaired or assumed). */
    repaired: number;
    /** Cleaned rows carrying at least one warning or error. */
    flagged: number;
    priced: number;
    weighed: number;
    dimensioned: number;
    /** Rows with a weight or a dimension parsed (the union, not the sum). */
    measured: number;
  };
  codes: Record<string, number>;
  products: {
    total: number;
    variants: number;
    conflicts: number;
    possibleDuplicates: number;
    /** Products with a conflict or a possible-duplicate flag (the union). */
    conflictsOrDuplicates: number;
    byTier: Record<string, number>;
    byStatus: Record<string, number>;
    claims: number;
  };
  ai: { calls: number; cached: number };
  claimsBlocked: number;
}

export const AI_TIER_ORDER: ReadonlyArray<{ key: string; label: string; tone: HygieneTone }> = [
  { key: "cheap", label: "Cheap model", tone: "good" },
  { key: "strong", label: "Strong model", tone: "changed" },
  { key: "vision", label: "Vision model", tone: "notice" },
  { key: "escalation", label: "Escalated after bad output", tone: "bad" },
  { key: "unrouted", label: "Not routed", tone: "muted" },
];

/** Safe division for bar widths: a zero whole, a negative part or a part beyond the whole never produce NaN or overflow. */
export function share(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(1, part / whole);
}

function count(codes: Record<string, number>, code: string): number {
  const n = codes[code];
  return typeof n === "number" && n > 0 ? n : 0;
}

function segments(total: number, parts: Array<Omit<HygieneSegment, "share">>): HygieneSegment[] {
  return parts.filter((p) => p.value > 0).map((p) => ({ ...p, share: share(p.value, total) }));
}

function item(key: string, label: string, value: number, extra: { tone?: HygieneTone; children?: HygieneItem[] } = {}): HygieneItem {
  return { key, label, value: Math.max(0, value), ...extra };
}

function ingestStage(c: HygieneCounts): HygieneStage {
  const { parsed, duplicates } = c.rows;
  const unique = Math.max(0, parsed - duplicates);
  return {
    key: "ingest",
    label: "Raw ingest",
    headline: { value: parsed, unit: "rows parsed" },
    bar: segments(parsed, [
      { key: "unique", label: "Unique rows", value: unique, tone: "good" },
      { key: "duplicates", label: "Exact duplicates collapsed", value: duplicates, tone: "changed" },
    ]),
    items: [item("unique", "Unique rows", unique, { tone: "good" }), item("duplicates", "Exact duplicate rows collapsed", duplicates, { tone: "changed" })],
    empty: "Not parsed yet",
  };
}

function cleaningStage(c: HygieneCounts): HygieneStage {
  const r = c.rows;
  const codes = c.codes;
  return {
    key: "cleaning",
    label: "Cleaning",
    headline: { value: r.cleaned, unit: "rows cleaned" },
    bar: segments(r.cleaned, [
      { key: "clean", label: "Nothing to fix", value: r.clean, tone: "good" },
      { key: "repaired", label: "Repaired or assumed", value: r.repaired, tone: "changed" },
      { key: "flagged", label: "Flagged with a warning", value: r.flagged, tone: "notice" },
    ]),
    items: [
      item("clean", "Nothing to fix", r.clean, { tone: "good" }),
      item("repaired", "Repaired or assumed", r.repaired, { tone: "changed" }),
      item("flagged", "Flagged with a warning", r.flagged, { tone: "notice" }),
      item("mojibake", "Mojibake repaired", count(codes, "text.mojibake_repaired")),
      item("unsafe_html", "Unsafe HTML removed", count(codes, "html.unsafe_removed")),
      item("tags", "HTML tags stripped", count(codes, "html.tags_stripped")),
      item("prices", "Prices normalised to cents", r.priced, {
        children: [
          item("price_ambiguous", "Ambiguous format", count(codes, "price.ambiguous")),
          item("price_currency", "Currency not recognised", count(codes, "price.currency_unrecognised")),
          item("price_missing", "No price", count(codes, "price.missing")),
        ],
      }),
      item("units", "Units converted or assumed", r.measured, {
        children: [
          item("weight", "Weight to grams", r.weighed),
          item("dimensions", "Dimensions to cm", r.dimensioned),
          item("unit_assumed", "Unit assumed", count(codes, "unit.assumed")),
          item("order_assumed", "Dimension order assumed", count(codes, "dimensions.order_assumed")),
        ],
      }),
      item("colour", "Colour typos fixed", count(codes, "color.fuzzy_match")),
      item("language", "Non-English rows", count(codes, "language.non_english")),
      item("truncated", "Descriptions truncated for the model", count(codes, "description.truncated")),
    ],
    empty: "Not cleaned yet",
  };
}

function groupingStage(c: HygieneCounts): HygieneStage {
  const p = c.products;
  const either = Math.min(p.total, Math.max(p.conflictsOrDuplicates, p.conflicts));
  const duplicatesOnly = Math.max(0, either - p.conflicts);
  const clean = Math.max(0, p.total - either);
  const sourceRows = Math.max(0, c.rows.parsed - c.rows.duplicates);
  return {
    key: "grouping",
    label: "Grouping",
    headline: { value: p.total, unit: "products" },
    bar: segments(p.total, [
      { key: "clean", label: "Grouped cleanly", value: clean, tone: "good" },
      { key: "duplicates", label: "Possible duplicate", value: duplicatesOnly, tone: "notice" },
      { key: "conflicts", label: "SKU conflict", value: p.conflicts, tone: "bad" },
    ]),
    items: [
      item("rows", "Source rows in", sourceRows),
      item("products", "Products", p.total),
      item("variants", "Variants", p.variants),
      item("clean", "Grouped cleanly", clean, { tone: "good" }),
      item("possible_duplicates", "Possible duplicate products", p.possibleDuplicates, { tone: "notice" }),
      item("conflicts", "SKU conflicts", p.conflicts, { tone: "bad" }),
    ],
    empty: "Not grouped yet",
  };
}

function routingStage(c: HygieneCounts): HygieneStage {
  const byTier = c.products.byTier;
  const known = new Set(AI_TIER_ORDER.map((t) => t.key));
  const tiers = [
    ...AI_TIER_ORDER.map((t) => ({ ...t, value: count(byTier, t.key) })),
    // A tier name this build does not know is still a count; show it rather than hide it.
    ...Object.keys(byTier)
      .filter((k) => !known.has(k))
      .sort()
      .map((k) => ({ key: k, label: k, tone: "muted" as const, value: count(byTier, k) })),
  ];
  const routed = tiers.filter((t) => t.key !== "unrouted").reduce((n, t) => n + t.value, 0);
  const total = routed + count(byTier, "unrouted");
  return {
    key: "routing",
    label: "AI routing",
    headline: { value: routed, unit: "products routed" },
    bar: segments(total, tiers.map((t) => ({ key: t.key, label: t.label, value: t.value, tone: t.tone }))),
    items: [
      ...tiers.filter((t) => t.key !== "unrouted" || t.value > 0).map((t) => item(t.key, t.label, t.value, { tone: t.tone })),
      item("calls", "Model calls", c.ai.calls),
      item("cached", "Answers from the response cache", Math.min(c.ai.cached, c.ai.calls)),
    ],
    empty: "Not routed yet",
  };
}

function groundingStage(c: HygieneCounts): HygieneStage {
  const s = c.products.byStatus;
  const total = c.products.total;
  const review = count(s, "needs_review");
  const failed = count(s, "failed");
  const pending = count(s, "pending_ai");
  const passed = Math.max(0, total - review - failed - pending);
  const items = [
    item("passed", "Passed as draft", passed, { tone: "good" }),
    item("review", "Needs review", review, { tone: "notice" }),
    item("failed", "Failed", failed, { tone: "bad" }),
  ];
  if (pending > 0) items.push(item("pending", "Awaiting the model", pending, { tone: "muted" }));
  items.push(item("claims", "Claims verified against the source", c.products.claims), item("blocked", "Claims blocked", c.claimsBlocked));
  return {
    key: "grounding",
    label: "Grounding gate",
    headline: { value: c.products.claims, unit: "claims verified" },
    bar: segments(total, [
      { key: "passed", label: "Passed as draft", value: passed, tone: "good" },
      { key: "review", label: "Needs review", value: review, tone: "notice" },
      { key: "failed", label: "Failed", value: failed, tone: "bad" },
      { key: "pending", label: "Awaiting the model", value: pending, tone: "muted" },
    ]),
    items,
    empty: "No claims verified yet",
  };
}

export function buildHygieneReport(counts: HygieneCounts): HygieneReport {
  return { stages: [ingestStage(counts), cleaningStage(counts), groupingStage(counts), routingStage(counts), groundingStage(counts)] };
}

/** Which hygiene stage an import status is working on, for the live marker; null for side states and the end. */
export function hygieneStageFor(status: string): HygieneStageKey | null {
  switch (status) {
    case "parsing":
      return "ingest";
    case "cleaning":
      return "cleaning";
    case "grouping":
      return "grouping";
    case "enriching":
      return "routing";
    case "validating":
      return "grounding";
    default:
      return null;
  }
}
