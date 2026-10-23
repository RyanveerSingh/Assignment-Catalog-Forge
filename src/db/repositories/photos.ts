import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { auditLog, imports, photos, products, variants } from "@/db/schema";
import { planAssign, planDismiss, planRestore } from "@/core/photos/manual";
import type { PhotoMatch, ProductGroup } from "@/core/types";

export type PhotoRecord = typeof photos.$inferSelect;

export type TrayPhotoStatus = "unmatched" | "rejected";

export interface TrayPhotoRecord {
  id: string;
  blobId: string;
  thumbBlobId: string;
  originalName: string;
  width: number;
  height: number;
  importId: string | null;
  importName: string | null;
  status: TrayPhotoStatus;
  rejectReason: string | null;
  createdAt: Date;
}

export interface PhotoActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

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

/** Photos the matcher left behind (or the merchant dismissed), newest first, with the import they came in with. */
export async function listPhotosByStatus(db: DbOrTx, storeId: string, status: TrayPhotoStatus, opts: { limit?: number; offset?: number } = {}): Promise<{ items: TrayPhotoRecord[]; total: number }> {
  const where = and(eq(photos.storeId, storeId), eq(photos.status, status));
  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(photos).where(where);
  const rows = await db
    .select({
      id: photos.id,
      blobId: photos.blobId,
      thumbBlobId: photos.thumbBlobId,
      originalName: photos.originalName,
      width: photos.width,
      height: photos.height,
      importId: photos.importId,
      importName: imports.name,
      rejectReason: photos.rejectReason,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .leftJoin(imports, eq(imports.id, photos.importId))
    .where(where)
    .orderBy(desc(photos.createdAt), asc(photos.id))
    .limit(opts.limit ?? 24)
    .offset(opts.offset ?? 0);
  return { total: countRow?.n ?? 0, items: rows.map((r) => ({ ...r, status })) };
}

async function loadPhotoState(db: DbOrTx, storeId: string, photoId: string): Promise<{ status: PhotoRecord["status"]; productId: string | null } | null> {
  const [row] = await db.select({ status: photos.status, productId: photos.productId }).from(photos).where(and(eq(photos.storeId, storeId), eq(photos.id, photoId))).limit(1);
  return row ?? null;
}

/**
 * Merchant assigns an unmatched (or dismissed) photo to a product (EC-C13). The caller republishes the
 * product afterwards so a live listing picks the photo up; that lives in src/jobs and is not imported here.
 */
export async function assignPhotoToProduct(db: Db, storeId: string, photoId: string, productId: string, actorId: string | null): Promise<PhotoActionResult> {
  return db.transaction(async (tx) => {
    const photo = await loadPhotoState(tx, storeId, photoId);
    const [product] = await tx.select({ id: products.id, deletedAt: products.deletedAt }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
    const siblings = product ? await tx.select({ position: photos.position }).from(photos).where(and(eq(photos.productId, product.id), eq(photos.status, "matched"))) : [];
    const plan = planAssign(photo, product ?? null, siblings.map((s) => s.position));
    if (!plan.ok) return { ok: false, code: plan.code, message: plan.message };
    await tx.update(photos).set(plan.patch).where(eq(photos.id, photoId));
    await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));
    await tx.insert(auditLog).values({ storeId, actorId, entity: "photo", entityId: photoId, action: "assign", diff: { productId, position: plan.patch.position, from: photo?.status ?? null } });
    return { ok: true };
  });
}

export async function dismissPhoto(db: Db, storeId: string, photoId: string, actorId: string | null): Promise<PhotoActionResult> {
  const photo = await loadPhotoState(db, storeId, photoId);
  const plan = planDismiss(photo);
  if (!plan.ok) return { ok: false, code: plan.code, message: plan.message };
  await db.update(photos).set(plan.patch).where(eq(photos.id, photoId));
  await db.insert(auditLog).values({ storeId, actorId, entity: "photo", entityId: photoId, action: "dismiss", diff: { reason: plan.patch.rejectReason } });
  return { ok: true };
}

export async function restorePhoto(db: Db, storeId: string, photoId: string, actorId: string | null): Promise<PhotoActionResult> {
  const photo = await loadPhotoState(db, storeId, photoId);
  const plan = planRestore(photo);
  if (!plan.ok) return { ok: false, code: plan.code, message: plan.message };
  await db.update(photos).set(plan.patch).where(eq(photos.id, photoId));
  await db.insert(auditLog).values({ storeId, actorId, entity: "photo", entityId: photoId, action: "restore", diff: null });
  return { ok: true };
}
