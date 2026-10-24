/** How a photo badge reads in the review drawer: the method in words, the score when it means something. */

export type MatchTone = "neutral" | "brand" | "warning";

interface MatchBadge {
  label: string;
  tone: MatchTone;
  /** Longer form for the tooltip and screen readers. */
  description: string;
}

const METHOD_LABELS: Record<string, string> = {
  image_column: "Image column",
  sku: "SKU",
  sku_token: "SKU in name",
  sku_stem: "Stem",
  handle: "Handle",
  fuzzy: "Fuzzy",
  manual: "Manual",
  none: "Unmatched",
};

const METHOD_DESCRIPTIONS: Record<string, string> = {
  image_column: "named in the sheet's image column",
  sku: "file name contains the SKU",
  sku_token: "the SKU sits inside a longer file name, such as a camera name",
  sku_stem: "file name contains the SKU stem",
  handle: "file name matches the product handle",
  fuzzy: "file name is close to the product name",
  manual: "assigned by hand",
  none: "not matched",
};

const WEAK_MATCH_BELOW = 70;

export function matchBadge(method: string, score: number): MatchBadge {
  const key = method in METHOD_LABELS ? method : "";
  const name = key ? METHOD_LABELS[key] : method.replace(/_/g, " ");
  const how = key ? METHOD_DESCRIPTIONS[key] : `matched by ${name}`;
  if (method === "manual") return { label: name, tone: "brand", description: how };
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  return { label: `${name} · ${safeScore}`, tone: safeScore < WEAK_MATCH_BELOW ? "warning" : "neutral", description: `${how}, score ${safeScore}` };
}
