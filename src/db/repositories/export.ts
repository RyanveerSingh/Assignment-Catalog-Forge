import { and, asc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { ExportProduct } from "@/core/export/types";
import { photos, products, translations, variants, type ProductStatus } from "@/db/schema";

export interface ExportFilters {
  status?: ProductStatus[];
  importId?: string;
  ids?: string[];
}

const PAGE = 200;

/** Keyset-paginated product stream for exports: never holds more than one page in memory (EC-J7). */
export async function* iterateProductsForExport(db: DbOrTx, storeId: string, imageUrl: (blobId: string) => string, filters: ExportFilters = {}): AsyncGenerator<ExportProduct> {
  let cursor: string | null = null;
  for (;;) {
    const conditions: SQL[] = [eq(products.storeId, storeId), isNull(products.deletedAt)];
    if (filters.status?.length) conditions.push(inArray(products.status, filters.status));
    if (filters.importId) conditions.push(eq(products.lastImportId, filters.importId));
    if (filters.ids?.length) conditions.push(inArray(products.id, filters.ids));
    if (cursor) conditions.push(gt(products.id, cursor));
    const page = await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.id))
      .limit(PAGE);
    if (page.length === 0) return;
    const ids = page.map((p) => p.id);
    const [variantRows, photoRows, translationRows] = await Promise.all([
      db.select().from(variants).where(inArray(variants.productId, ids)).orderBy(asc(variants.position)),
      db.select().from(photos).where(and(inArray(photos.productId, ids), eq(photos.status, "matched"))).orderBy(asc(photos.position)),
      db.select().from(translations).where(and(inArray(translations.productId, ids), sql`${translations.text} is not null`)),
    ]);
    for (const p of page) {
      const content = p.draft ?? { title: null, descriptionHtml: null, category: null, tags: [], attributes: {}, seo: { metaTitle: null, metaDescription: null } };
      const pv = variantRows.filter((v) => v.productId === p.id);
      const pp = photoRows.filter((ph) => ph.productId === p.id);
      const pt = translationRows.filter((t) => t.productId === p.id && (t.status === "fresh" || t.origin === "manual"));
      const trans: ExportProduct["translations"] = {};
      for (const t of pt) {
        const bucket = (trans[t.locale] ??= {});
        if (t.field === "title") bucket.title = t.text;
        else if (t.field === "descriptionHtml") bucket.descriptionHtml = t.text;
        else if (t.field === "metaTitle") bucket.metaTitle = t.text;
        else if (t.field === "metaDescription") bucket.metaDescription = t.text;
      }
      yield {
        handle: p.handle,
        title: content.title,
        descriptionHtml: content.descriptionHtml,
        category: content.category,
        tags: content.tags,
        attributes: content.attributes,
        seo: content.seo,
        vendor: p.group?.brand ?? null,
        status: p.status,
        reviewReasons: p.reviewReasons,
        confidence: p.confidence,
        claims: p.claims.map((c) => ({ text: c.text, source: c.source })),
        sourceRows: p.sourceRows,
        variants: pv.map((v) => ({
          sku: v.skuDisplay || v.sku,
          options: v.options,
          priceCents: v.priceCents,
          currency: v.currency,
          compareAtCents: v.compareAtCents,
          weightGrams: v.weightGrams,
          dimensionsCm: v.dimensions,
          barcode: v.barcode,
          quantity: v.quantity,
          imageUrls: pp.filter((ph) => ph.variantId === v.id).map((ph) => imageUrl(ph.blobId)),
        })),
        imageUrls: pp.map((ph) => imageUrl(ph.blobId)),
        translations: Object.keys(trans).length ? trans : undefined,
      };
    }
    cursor = page[page.length - 1]!.id;
    if (page.length < PAGE) return;
  }
}
