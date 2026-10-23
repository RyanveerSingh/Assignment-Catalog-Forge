import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Issue } from "@/core/types";
import type { DbOrTx } from "@/db/client";
import { importRows, imports, photos, products, translations, variants, type ProductStatus } from "@/db/schema";

export interface ProductListFilters {
  status?: ProductStatus[];
  search?: string;
  importId?: string;
  category?: string;
  minConfidence?: number;
  maxConfidence?: number;
  hasPhotos?: boolean;
  outdatedTranslations?: boolean;
  missingFromImport?: boolean;
  includeDeleted?: boolean;
}

export type ProductSortKey = "updatedAt" | "title" | "status" | "confidence" | "price" | "createdAt";

export interface ProductListOptions {
  filters?: ProductListFilters;
  sort?: ProductSortKey;
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ProductListItem {
  id: string;
  productKey: string;
  handle: string;
  status: ProductStatus;
  title: string | null;
  category: string | null;
  confidence: Record<string, number>;
  minConfidence: number | null;
  reviewReasons: string[];
  variantCount: number;
  priceFromCents: number | null;
  currency: string | null;
  photoCount: number;
  thumbBlobId: string | null;
  aiTier: string | null;
  aiModel: string | null;
  aiCostMicros: number;
  language: string;
  lastImportId: string | null;
  missingFromImportId: string | null;
  sourceChangedAt: string | null;
  published: boolean;
  deletedAt: string | null;
  translations: { fresh: number; outdated: number; failed: number; pending: number };
  updatedAt: string;
  createdAt: string;
}

// Correlated subqueries reference the outer table by its fully qualified name on purpose: Drizzle renders an
// interpolated main-table column unqualified ("id") inside raw SQL, which would bind to the subquery's own table.
const minConfidenceSql = sql<number | null>`(select min(value::int) from jsonb_each_text(products.confidence))`;
const variantCountSql = sql<number>`(select count(*)::int from variants v where v.product_id = products.id)`;
const priceFromSql = sql<number | null>`(select min(v.price_cents) from variants v where v.product_id = products.id)`;
const currencySql = sql<string | null>`(select min(v.currency) from variants v where v.product_id = products.id and v.price_cents is not null)`;
const photoCountSql = sql<number>`(select count(*)::int from photos ph where ph.product_id = products.id and ph.status = 'matched')`;
const thumbSql = sql<string | null>`(select ph.thumb_blob_id from photos ph where ph.product_id = products.id and ph.status = 'matched' order by ph.position asc limit 1)`;
const translationSql = sql<Record<string, number>>`(select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*)::int as n from translations t where t.product_id = products.id group by status) s)`;

/** Server-side paginated, sortable, filterable product listing for the dashboard table. */
export async function listProducts(db: DbOrTx, storeId: string, opts: ProductListOptions = {}): Promise<{ items: ProductListItem[]; total: number }> {
  const f = opts.filters ?? {};
  const conditions: SQL[] = [eq(products.storeId, storeId)];
  if (!f.includeDeleted) conditions.push(isNull(products.deletedAt));
  if (f.status && f.status.length > 0) conditions.push(inArray(products.status, f.status));
  if (f.importId) conditions.push(eq(products.lastImportId, f.importId));
  if (f.category) conditions.push(sql`${products.draft}->>'category' like ${`${f.category}%`}`);
  if (f.search) {
    const q = `%${f.search.trim()}%`;
    conditions.push(
      sql`(${products.draft}->>'title' ilike ${q} or ${products.productKey} ilike ${q} or ${products.handle} ilike ${q} or exists (select 1 from variants v where v.product_id = ${products.id} and v.sku ilike ${q}))`,
    );
  }
  if (f.minConfidence !== undefined) conditions.push(sql`${minConfidenceSql} >= ${f.minConfidence}`);
  if (f.maxConfidence !== undefined) conditions.push(sql`${minConfidenceSql} <= ${f.maxConfidence}`);
  if (f.hasPhotos === true) conditions.push(sql`${photoCountSql} > 0`);
  if (f.hasPhotos === false) conditions.push(sql`${photoCountSql} = 0`);
  if (f.outdatedTranslations) conditions.push(sql`exists (select 1 from translations t where t.product_id = ${products.id} and t.status = 'outdated')`);
  if (f.missingFromImport) conditions.push(sql`${products.missingFromImportId} is not null`);
  const where = and(...conditions);

  const dir = opts.direction === "asc" ? asc : desc;
  const orderBy = (() => {
    switch (opts.sort) {
      case "title":
        return dir(sql`lower(${products.draft}->>'title')`);
      case "status":
        return dir(products.status);
      case "confidence":
        return dir(minConfidenceSql);
      case "price":
        return dir(priceFromSql);
      case "createdAt":
        return dir(products.createdAt);
      default:
        return dir(products.updatedAt);
    }
  })();

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(where);
  const rows = await db
    .select({
      id: products.id,
      productKey: products.productKey,
      handle: products.handle,
      status: products.status,
      draft: products.draft,
      confidence: products.confidence,
      minConfidence: minConfidenceSql,
      reviewReasons: products.reviewReasons,
      variantCount: variantCountSql,
      priceFromCents: priceFromSql,
      currency: currencySql,
      photoCount: photoCountSql,
      thumbBlobId: thumbSql,
      aiTier: products.aiTier,
      aiModel: products.aiModel,
      aiCostMicros: products.aiCostMicros,
      language: products.language,
      lastImportId: products.lastImportId,
      missingFromImportId: products.missingFromImportId,
      sourceChangedAt: products.sourceChangedAt,
      published: sql<boolean>`${products.published} is not null`,
      deletedAt: products.deletedAt,
      translationCounts: translationSql,
      updatedAt: products.updatedAt,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(where)
    .orderBy(orderBy, asc(products.id))
    .limit(opts.limit ?? 25)
    .offset(opts.offset ?? 0);

  return {
    total: countRow?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      productKey: r.productKey,
      handle: r.handle,
      status: r.status,
      title: r.draft?.title ?? null,
      category: r.draft?.category ?? null,
      confidence: r.confidence,
      minConfidence: r.minConfidence === null ? null : Number(r.minConfidence),
      reviewReasons: r.reviewReasons,
      variantCount: Number(r.variantCount),
      priceFromCents: r.priceFromCents === null ? null : Number(r.priceFromCents),
      currency: r.currency,
      photoCount: Number(r.photoCount),
      thumbBlobId: r.thumbBlobId,
      aiTier: r.aiTier,
      aiModel: r.aiModel,
      aiCostMicros: Number(r.aiCostMicros),
      language: r.language,
      lastImportId: r.lastImportId,
      missingFromImportId: r.missingFromImportId,
      sourceChangedAt: r.sourceChangedAt?.toISOString() ?? null,
      published: Boolean(r.published),
      deletedAt: r.deletedAt?.toISOString() ?? null,
      translations: {
        fresh: Number(r.translationCounts?.fresh ?? 0),
        outdated: Number(r.translationCounts?.outdated ?? 0),
        failed: Number(r.translationCounts?.failed ?? 0),
        pending: Number(r.translationCounts?.pending ?? 0),
      },
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface ProductDetailSourceRow {
  rowNumber: number;
  raw: Record<string, string>;
  /** The stored CleanedRow (typed unknown in the schema); the API turns it into the cleaning X-ray. */
  cleaned: unknown;
  issues: Issue[];
  status: string;
  duplicateOfRow: number | null;
}

export interface ProductDetail {
  product: typeof products.$inferSelect;
  variants: Array<typeof variants.$inferSelect>;
  photos: Array<typeof photos.$inferSelect>;
  translations: Array<typeof translations.$inferSelect>;
  sourceRows: ProductDetailSourceRow[];
  importName: string | null;
  /** The import's column map, so the X-ray pairs each raw cell with the field the cleaner read it as. */
  columnMap: unknown[] | null;
}

export async function getProductDetail(db: DbOrTx, storeId: string, productId: string): Promise<ProductDetail | null> {
  const [product] = await db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!product) return null;
  const [variantRows, photoRows, translationRows] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, productId)).orderBy(asc(variants.position)),
    db.select().from(photos).where(and(eq(photos.productId, productId), eq(photos.status, "matched"))).orderBy(asc(photos.position)),
    db.select().from(translations).where(eq(translations.productId, productId)).orderBy(asc(translations.locale), asc(translations.field)),
  ]);
  const rowNumbers = [...product.sourceRows, ...product.duplicateRows.map((d) => d.row)];
  const sourceRows =
    product.lastImportId && rowNumbers.length > 0
      ? await db
          .select({ rowNumber: importRows.rowNumber, raw: importRows.raw, cleaned: importRows.cleaned, issues: importRows.issues, status: importRows.status, duplicateOfRow: importRows.duplicateOfRow })
          .from(importRows)
          .where(and(eq(importRows.importId, product.lastImportId), inArray(importRows.rowNumber, rowNumbers)))
          .orderBy(asc(importRows.rowNumber))
      : [];
  const [imp] = product.lastImportId ? await db.select({ name: imports.name, columnMap: imports.columnMap }).from(imports).where(eq(imports.id, product.lastImportId)).limit(1) : [];
  return { product, variants: variantRows, photos: photoRows, translations: translationRows, sourceRows, importName: imp?.name ?? null, columnMap: imp?.columnMap ?? null };
}

export async function listCategories(db: DbOrTx, storeId: string): Promise<Array<{ category: string; n: number }>> {
  const result = await db.execute<{ category: string; n: string }>(sql`
    select draft->>'category' as category, count(*)::text as n
      from products where store_id = ${storeId} and deleted_at is null and draft->>'category' is not null
     group by 1 order by 2 desc limit 200
  `);
  return result.rows.map((r) => ({ category: r.category, n: Number(r.n) }));
}
