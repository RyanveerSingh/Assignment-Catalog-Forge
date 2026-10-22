import type { EnrichProductInput } from "@/core/ai/prompts";
import type { ProductGroup } from "@/core/types";

const CELL_LIMIT = 1_500;
const ATTRIBUTE_DENYLIST = new Set(["cost", "cost_price", "ek", "einkaufspreis"]);

/** Project a deterministic group plus its raw cells into what the model is shown. Money never goes in. */
export function buildEnrichProductInput(group: ProductGroup, rows: Array<{ row: number; cells: Record<string, string> }>, photoNames: string[]): EnrichProductInput {
  const optionNames = [...new Set(group.variants.flatMap((v) => Object.keys(v.options)))];
  const optionValues: Record<string, string[]> = {};
  for (const name of optionNames) optionValues[name] = [...new Set(group.variants.map((v) => v.options[name]).filter((x): x is string => !!x))];
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(group.attributes)) {
    if (ATTRIBUTE_DENYLIST.has(k.toLowerCase())) continue;
    attributes[k] = v.slice(0, 300);
  }
  const issues = [...group.conflicts, ...group.issues]
    .filter((i) => i.severity !== "info" && !i.code.startsWith("price."))
    .map((i) => i.message)
    .slice(0, 8);

  return {
    product_key: group.productKey,
    language: group.language.lang,
    source_title: group.title,
    source_description: group.descriptionText,
    category_hint: group.category,
    brand: group.brand,
    material: group.material,
    color: group.color,
    care: group.care,
    notes: group.notes,
    tags: group.tags,
    option_names: optionNames,
    option_values: optionValues,
    variant_count: group.variants.length,
    attributes,
    photo_names: photoNames,
    rows: rows.map((r) => ({
      row: r.row,
      cells: Object.fromEntries(
        Object.entries(r.cells)
          .filter(([k, v]) => v && v.trim().length > 0 && !ATTRIBUTE_DENYLIST.has(k.toLowerCase()))
          .map(([k, v]) => [k, v.length > CELL_LIMIT ? `${v.slice(0, CELL_LIMIT)}…` : v]),
      ),
    })),
    issues,
  };
}
