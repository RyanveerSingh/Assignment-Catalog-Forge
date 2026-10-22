import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { photos, products, variants } from "@/db/schema";
import type { PhotoMatch, ProductGroup } from "@/core/types";

export type PhotoRecord = typeof photos.$inferSelect;

export async function listPhotosForImport(db: DbOrTx, importId: string): Promise<PhotoRecord[]> {
  return db.select().from(photos).where(eq(photos.importId, importId)).orderBy(asc(photos.createdAt));
}

export async function listPhotosForProducts(db: DbOrTx, productIds: string[]): Promise<PhotoRecord[]> {
  if (productIds.length === 0) return [];
  return db
    .select()
    .from(photos)
    .where(and(inArray(photos.productId, productIds), eq(photos.status, "matched")))
    .orderBy(asc(photos.position));
}

export async function findPhotoBySha(db: DbOrTx, storeId: string, sha256: string): Promise<PhotoRecord | null> {
  const [row] = await db.select().from(photos).where(and(eq(photos.storeId, storeId), eq(photos.sha256, sha256))).limit(1);
  return row ?? null;
}

export async function insertPhoto(db: DbOrTx, input: typeof photos.$inferInsert): Promise<string> {
  const [row] = await db.insert(photos).values(input).returning({ id: photos.id });
  if (!row) throw new Error("photo insert returned no row");
  return row.id;
}

/** Apply matcher output to unmatched photos. Matched photos keep their assignment; re-runs are safe. */
export async function applyPhotoMatches(db: DbOrTx, importId: string, matches: PhotoMatch[]): Promise<{ matched: number; unmatched: number }> {
  const existing = await listPhotosForImport(db, importId);
  const byName = new Map(existing.map((p) => [p.originalName, p] as const));
  const keys = [...new Set(matches.map((m) => m.productKey).filter((k): k is string => !!k))];
  const productRows = keys.length
    ? await db.select({ id: products.id, productKey: products.productKey, storeId: products.storeId }).from(products).where(inArray(products.productKey, keys))
    : [];
  const productIdByKey = new Map(productRows.map((p) => [p.productKey, p.id] as const));
  const skus = [...new Set(matches.map((m) => m.sku).filter((s): s is string => !!s))];
  const variantRows = skus.length ? await db.select({ id: variants.id, sku: variants.sku, productId: variants.productId }).from(variants).where(inArray(variants.sku, skus)) : [];
  const variantIdBySku = new Map(variantRows.map((v) => [v.sku, v.id] as const));

  let matched = 0;
  let unmatched = 0;
  for (const m of matches) {
    const photo = byName.get(m.filename);
    if (!photo || photo.status === "rejected") continue;
    if (photo.status === "matched" && photo.productId) continue;
    const productId = m.productKey ? (productIdByKey.get(m.productKey) ?? null) : null;
    if (!productId) {
      unmatched += 1;
      continue;
    }
    await db
      .update(photos)
      .set({ productId, variantId: m.sku ? (variantIdBySku.get(m.sku) ?? null) : null, position: m.position, matchMethod: m.method, matchScore: m.score, status: "matched" })
      .where(eq(photos.id, photo.id));
    matched += 1;
  }
  return { matched, unmatched };
}

export function groupsFromProducts(rows: Array<{ group: ProductGroup | null }>): ProductGroup[] {
  return rows.map((r) => r.group).filter((g): g is ProductGroup => g !== null);
}
