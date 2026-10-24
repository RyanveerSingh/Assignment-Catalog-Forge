import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { storefrontProducts, stores } from "@/db/schema";

export type StorefrontRow = typeof storefrontProducts.$inferSelect;

export interface StorefrontStore {
  id: string;
  slug: string;
  name: string;
  locales: string[];
  countryLocaleMap: Record<string, string>;
  defaultCurrency: string;
}

/**
 * A fingerprint of a store's published catalogue: row count and latest change. Publishing, re-publishing
 * or unpublishing anything changes it, which is what lets the storefront cache key on it.
 */
export async function getStorefrontVersion(db: DbOrTx, storeId: string): Promise<string> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, at: sql<string>`coalesce(extract(epoch from max(${storefrontProducts.updatedAt})), 0)::text` })
    .from(storefrontProducts)
    .where(eq(storefrontProducts.storeId, storeId));
  return `${row?.n ?? 0}:${row?.at ?? "0"}`;
}

/** Storefront reads go through the storefront pool and only touch the published snapshot table (EC-H6). */
export async function getStorefrontStore(db: DbOrTx, slug: string): Promise<StorefrontStore | null> {
  const [row] = await db
    .select({ id: stores.id, slug: stores.slug, name: stores.name, locales: stores.locales, countryLocaleMap: stores.countryLocaleMap, defaultCurrency: stores.defaultCurrency })
    .from(stores)
    .where(eq(stores.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function listStorefrontProducts(
  db: DbOrTx,
  storeId: string,
  locale: string,
  opts: { category?: string; limit?: number; offset?: number; sort?: "newest" | "price_asc" | "price_desc" } = {},
): Promise<{ items: StorefrontRow[]; total: number }> {
  const conditions = [eq(storefrontProducts.storeId, storeId), eq(storefrontProducts.locale, locale)];
  if (opts.category) conditions.push(sql`${storefrontProducts.category} like ${`${opts.category}%`}`);
  const where = and(...conditions);
  const order =
    opts.sort === "price_asc" ? asc(storefrontProducts.priceFromCents) : opts.sort === "price_desc" ? desc(storefrontProducts.priceFromCents) : desc(storefrontProducts.updatedAt);
  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(storefrontProducts).where(where);
  const items = await db
    .select()
    .from(storefrontProducts)
    .where(where)
    .orderBy(order, asc(storefrontProducts.handle))
    .limit(opts.limit ?? 24)
    .offset(opts.offset ?? 0);
  return { items, total: countRow?.n ?? 0 };
}

export async function getStorefrontProduct(db: DbOrTx, storeId: string, locale: string, handle: string): Promise<StorefrontRow | null> {
  const [row] = await db
    .select()
    .from(storefrontProducts)
    .where(and(eq(storefrontProducts.storeId, storeId), eq(storefrontProducts.locale, locale), eq(storefrontProducts.handle, handle)))
    .limit(1);
  return row ?? null;
}

export async function listStorefrontCategories(db: DbOrTx, storeId: string, locale: string): Promise<Array<{ category: string; n: number }>> {
  const result = await db.execute<{ category: string; n: string }>(sql`
    select category, count(*)::text as n from storefront_products
     where store_id = ${storeId} and locale = ${locale} and category is not null
     group by category order by category
  `);
  return result.rows.map((r) => ({ category: r.category, n: Number(r.n) }));
}

export interface StorefrontCategoryPhoto {
  category: string;
  imageId: string;
  thumbId: string;
  alt: string;
  updatedAtMs: number;
}

/** The first photo of the newest photographed product in each category path; the storefront borrows it for category tiles and menus. */
export async function listStorefrontCategoryPhotos(db: DbOrTx, storeId: string, locale: string): Promise<StorefrontCategoryPhoto[]> {
  const result = await db.execute<{ category: string; image_id: string; thumb_id: string | null; alt: string | null; updated_ms: number }>(sql`
    select distinct on (category) category,
           images->0->>'id' as image_id, images->0->>'thumbId' as thumb_id, images->0->>'alt' as alt,
           (extract(epoch from updated_at) * 1000)::float8 as updated_ms
      from storefront_products
     where store_id = ${storeId} and locale = ${locale} and category is not null and jsonb_array_length(images) > 0
     order by category, updated_at desc
  `);
  return result.rows.map((r) => ({ category: r.category, imageId: r.image_id, thumbId: r.thumb_id ?? r.image_id, alt: r.alt ?? "", updatedAtMs: Number(r.updated_ms) }));
}
