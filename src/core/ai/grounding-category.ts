import type { Issue, ProductGroup } from "@/core/types";
import { issue } from "@/core/types";
import { nearestTaxonomyPath, resolveSourceCategory, TAXONOMY, TAXONOMY_FALLBACK } from "./taxonomy";

/** The category step of the grounding validator (EC-D3): the model's answer must be a taxonomy path. */

export interface CategoryDecision {
  category: string;
  snapped: boolean;
  fallback: boolean;
  modelConfidence: number;
  issues: Issue[];
  reviewReasons: string[];
}

export function decideCategory(modelCategory: string, modelConfidence: number, group: ProductGroup): CategoryDecision {
  const issues: Issue[] = [];
  const reviewReasons: string[] = [];
  let category = modelCategory.trim();
  let snapped = false;
  let fallback = false;
  let confidence = modelConfidence;
  // The supplier's own category column is source data; when it maps to a taxonomy node it outranks
  // the model's opinion, exactly as prices and SKUs do.
  const sourceCategory = group.category ? resolveSourceCategory(group.category) : null;
  const isParentNode = !TAXONOMY.includes(category) && TAXONOMY.some((p) => p.startsWith(`${category} > `));
  if (isParentNode) {
    // A parent node ("Home & Garden > Decor") is a legitimate, deliberately vague answer: keep it, cap confidence.
    issues.push(issue("category.generic", "info", `Category "${category}" is a parent node, not a leaf`, { field: "category", ec: "D3" }));
    snapped = true;
  } else if (!TAXONOMY.includes(category)) {
    const nearest = nearestTaxonomyPath(category);
    if (nearest) {
      issues.push(issue("category.snapped", "info", `Category "${category}" mapped to "${nearest}"`, { field: "category", ec: "D3" }));
      category = nearest;
      snapped = true;
    } else if (sourceCategory) {
      issues.push(issue("category.snapped", "info", `Category "${category}" is not in the taxonomy; the supplier's category "${sourceCategory}" is used`, { field: "category", ec: "D3" }));
      category = sourceCategory;
      snapped = true;
      confidence = Math.max(confidence, 75);
    } else {
      issues.push(issue("category.unknown", "warn", `Category "${category}" is not in the taxonomy`, { field: "category", ec: "D3" }));
      reviewReasons.push(`Category "${category}" is not in the taxonomy`);
      category = TAXONOMY_FALLBACK;
      fallback = true;
    }
  }
  if (sourceCategory && !fallback && !category.toLowerCase().startsWith(sourceCategory.toLowerCase())) {
    issues.push(issue("category.source", "info", `Model chose "${category}"; the supplier's category "${sourceCategory}" is used`, { field: "category", ec: "D3" }));
    category = sourceCategory;
    snapped = !TAXONOMY.includes(sourceCategory);
    confidence = Math.max(confidence, 85);
  }
  // A leaf the model itself doubts ("Pencils" for a sharpener at 55) becomes its parent node: vague
  // beats wrong, the storefront still files it sensibly, and no reviewer is needed for it.
  if (!fallback && confidence < 60 && category.includes(" > ")) {
    const parent = category.slice(0, category.lastIndexOf(" > "));
    issues.push(issue("category.generic", "info", `Low confidence in "${category}"; filed under its parent "${parent}"`, { field: "category", ec: "D3" }));
    category = parent;
    snapped = true;
    confidence = Math.max(confidence, 70);
  }
  return { category, snapped, fallback, modelConfidence: confidence, issues, reviewReasons };
}
