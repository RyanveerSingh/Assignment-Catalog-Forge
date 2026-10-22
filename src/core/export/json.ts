import type { ExportProduct, ExportVariant } from "./types";

function toVariantJson(v: ExportVariant): Record<string, unknown> {
  return {
    sku: v.sku ?? "",
    options: v.options ?? {},
    price_cents: v.priceCents ?? null,
    currency: v.currency ?? null,
    weight_grams: v.weightGrams ?? null,
    compare_at_cents: v.compareAtCents ?? null,
    barcode: v.barcode ?? null,
    quantity: v.quantity ?? null,
    dimensions_cm: v.dimensionsCm ?? null,
  };
}

/**
 * The public JSON shape of a product (snake_case, as in the assignment brief). Nullable
 * fields are emitted as `null` rather than omitted so consumers can rely on the key set;
 * `translations` is the one optional key.
 */
export function toExportJson(p: ExportProduct): Record<string, unknown> {
  const reasons = (p.reviewReasons ?? []).filter((r) => typeof r === "string" && r.length > 0);
  const out: Record<string, unknown> = {
    title: p.title ?? null,
    handle: p.handle ?? "",
    description_html: p.descriptionHtml ?? null,
    category: p.category ?? null,
    tags: p.tags ?? [],
    attributes: p.attributes ?? {},
    variants: (p.variants ?? []).filter((v) => v != null).map(toVariantJson),
    claims: (p.claims ?? [])
      .filter((c) => c != null)
      .map((c) => ({ text: c.text ?? "", source: c.source ?? "" })),
    confidence: p.confidence ?? {},
    status: p.status ?? "draft",
    review_reason: reasons.length > 0 ? reasons.join("; ") : null,
    source_rows: p.sourceRows ?? [],
    images: p.imageUrls ?? [],
    seo: {
      meta_title: p.seo?.metaTitle ?? null,
      meta_description: p.seo?.metaDescription ?? null,
    },
  };
  if (p.translations !== undefined) out.translations = p.translations;
  return out;
}

/**
 * Yields a JSON array one product at a time ("[", then objects separated by ",", then "]").
 * The caller pipes the chunks to the response, so a 10,000-product export never exists as
 * a single string in memory (EC-J7).
 */
export function* streamJsonArray(products: Iterable<ExportProduct>): Generator<string, void, unknown> {
  yield "[";
  let first = true;
  for (const p of products) {
    if (p == null) continue;
    if (!first) yield ",";
    first = false;
    yield JSON.stringify(toExportJson(p));
  }
  yield "]";
}
