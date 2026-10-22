import type { ProductGroup } from "@/core/types";

export type AiTier = "cheap" | "strong" | "vision";

export interface RoutingDecision {
  tier: AiTier;
  reasons: string[];
}

/** Complexity at or above this goes to the strong model. Tuned with the eval harness; config, not a constant. */
export const STRONG_THRESHOLD = 35;

/**
 * Smart routing (EC cost section): clean, well-described rows go to the cheap model; messy ones
 * to the strong model; the vision model only when photos exist AND the text is too thin to
 * name or categorise the product on its own.
 */
export function routeTier(group: ProductGroup, photoCount: number, threshold = STRONG_THRESHOLD): RoutingDecision {
  const reasons: string[] = [];
  const thinText = !group.title || !group.descriptionText || group.descriptionText.length < 20;
  if (thinText && photoCount > 0) {
    reasons.push(group.title ? "description missing; photos available" : "title missing; photos available");
    return { tier: "vision", reasons };
  }
  if (group.conflicts.length > 0) reasons.push("conflicting source rows");
  if (group.language.lang !== "en" && group.language.lang !== "und") reasons.push(`source language ${group.language.lang}`);
  if (!group.descriptionText) reasons.push("no description");
  if (!group.title) reasons.push("no title");
  if (group.issues.some((i) => i.severity === "error")) reasons.push("cleaning errors");
  if (group.complexity >= threshold) {
    reasons.push(`complexity ${group.complexity} ≥ ${threshold}`);
    return { tier: "strong", reasons };
  }
  return { tier: "cheap", reasons: reasons.length ? reasons : ["clean source"] };
}

/** Where a retry goes after the model failed to produce valid output (EC-D1). */
export function escalateTier(current: AiTier): AiTier {
  return current === "cheap" ? "strong" : current;
}
