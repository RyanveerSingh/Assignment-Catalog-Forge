import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { products, variants, type ProductClaim, type ProductContent, type ProductGuardrail, type ProductStatus } from "@/db/schema";
import { slugify } from "@/core/clean/row";
import type { ProductGroup } from "@/core/types";

export type ProductRecord = typeof products.$inferSelect;
export type VariantRecord = typeof variants.$inferSelect;

export interface UpsertGroupResult {
  productId: string;
  created: boolean;
  /** False when the source hash is unchanged: no AI call is needed (EC-D20, C10). */
  sourceChanged: boolean;
  previousStatus: ProductStatus | null;
}

/**
 * Create or update a product from a deterministic group. Identity is (store, product_key); a
 * re-upload therefore updates in place and can never create a duplicate (EC-C10, E7).
 * Published snapshots are never touched here (EC-F4); manual overrides are preserved (EC-F1).
 */
export async function upsertProductFromGroup(db: DbOrTx, storeId: string, importId: string, group: ProductGroup): Promise<UpsertGroupResult> {
  const [existing] = await db
    .select({ id: products.id, status: products.status, sourceHash: products.sourceHash, handle: products.handle, published: products.published, deletedAt: products.deletedAt })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.productKey, group.productKey)))
    .limit(1);

  // pg advisory lock keyed on the product key serialises two imports touching the same product (EC-E8).
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`${storeId}:${group.productKey}`}))`);

  if (!existing) {
    const handle = await uniqueHandle(db, storeId, slugify(group.title ?? group.productKey) || slugify(group.productKey) || "product");
    const [row] = await db
      .insert(products)
      .values({
        storeId,
        productKey: group.productKey,
        handle,
        status: "pending_ai",
        group,
        sourceRows: group.sourceRows,
        duplicateRows: group.duplicateRows,
        sourceHash: group.sourceHash,
        language: group.language.lang,
        lastImportId: importId,
      })
      .returning({ id: products.id });
    if (!row) throw new Error("product insert returned no row");
    await replaceVariants(db, storeId, row.id, group);
    return { productId: row.id, created: true, sourceChanged: true, previousStatus: null };
  }

  const sourceChanged = existing.sourceHash !== group.sourceHash;
  const wasApproved = existing.status === "approved";
  await db
    .update(products)
    .set({
      group,
      sourceRows: group.sourceRows,
      duplicateRows: group.duplicateRows,
      sourceHash: group.sourceHash,
      language: group.language.lang,
      lastImportId: importId,
      missingFromImportId: null,
      ...(sourceChanged
        ? {
            // New source text means a new draft; a live listing stays live until re-approved (EC-F4).
            status: existing.deletedAt ? existing.status : "pending_ai",
            sourceChangedAt: wasApproved || existing.published ? new Date() : null,
            translatedAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, existing.id));
  if (sourceChanged) await replaceVariants(db, storeId, existing.id, group);
  return { productId: existing.id, created: false, sourceChanged, previousStatus: existing.status };
}

async function replaceVariants(db: DbOrTx, storeId: string, productId: string, group: ProductGroup): Promise<void> {
  const keep = group.variants.map((v) => v.sku);
  if (keep.length > 0) {
    await db.delete(variants).where(and(eq(variants.productId, productId), sql`${variants.sku} not in ${keep}`));
  } else {
    await db.delete(variants).where(eq(variants.productId, productId));
  }
  for (const [position, v] of group.variants.entries()) {
    await db
      .insert(variants)
      .values({
        productId,
        storeId,
        sku: v.sku,
        skuDisplay: v.skuDisplay,
        synthetic: v.synthetic,
        options: v.options,
        priceCents: v.priceCents,
        currency: v.currency,
        compareAtCents: v.compareAtCents,
        weightGrams: v.weightGrams,
        dimensions: v.dimensions,
        quantity: v.quantity,
        barcode: v.barcode,
        position,
        sourceRows: v.sourceRows,
        issues: v.issues,
      })
      .onConflictDoUpdate({
        target: [variants.storeId, variants.sku],
        set: {
          productId,
          skuDisplay: v.skuDisplay,
          synthetic: v.synthetic,
          options: v.options,
          priceCents: v.priceCents,
          currency: v.currency,
          compareAtCents: v.compareAtCents,
          weightGrams: v.weightGrams,
          dimensions: v.dimensions,
          quantity: v.quantity,
          barcode: v.barcode,
          position,
          sourceRows: v.sourceRows,
          issues: v.issues,
          updatedAt: new Date(),
        },
      });
  }
}

/** Handles are stable once assigned; collisions get -2, -3 … (EC-H7). */
async function uniqueHandle(db: DbOrTx, storeId: string, base: string): Promise<string> {
  const taken = await db
    .select({ handle: products.handle })
    .from(products)
    .where(and(eq(products.storeId, storeId), sql`${products.handle} = ${base} or ${products.handle} like ${`${base}-%`}`));
  const set = new Set(taken.map((t) => t.handle));
  if (!set.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export interface AiResultInput {
  content: ProductContent;
  claims: ProductClaim[];
  guardrails: ProductGuardrail[];
  confidence: Record<string, number>;
  reviewReasons: string[];
  status: "draft" | "needs_review";
  aiTier: string;
  aiModel: string;
  promptVersion: string;
  costMicros: number;
  latencyMs: number;
}

/** Store the validated AI result as the draft. Manual overrides win over the new draft (EC-F1). */
export async function setProductAiResult(db: DbOrTx, productId: string, input: AiResultInput): Promise<boolean> {
  const [current] = await db.select({ manualOverrides: products.manualOverrides, status: products.status }).from(products).where(eq(products.id, productId)).limit(1);
  if (!current) return false;
  const draft: ProductContent = { ...input.content, ...stripUndefined(current.manualOverrides) };
  const rows = await db
    .update(products)
    .set({
      draft,
      claims: input.claims,
      guardrails: input.guardrails,
      confidence: input.confidence,
      reviewReasons: input.reviewReasons,
      status: input.status,
      aiTier: input.aiTier,
      aiModel: input.aiModel,
      promptVersion: input.promptVersion,
      aiCostMicros: sql`${products.aiCostMicros} + ${input.costMicros}`,
      aiLatencyMs: input.latencyMs,
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.status, "pending_ai")))
    .returning({ id: products.id });
  return rows.length > 0;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

export async function failProduct(db: DbOrTx, productId: string, reason: string): Promise<void> {
  await db
    .update(products)
    .set({ status: "failed", failureReason: reason.slice(0, 2000), updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.status, "pending_ai")));
}

export async function assignAiBatchKeys(db: DbOrTx, importId: string, batchSize: number, tierOf: (p: { id: string; group: ProductGroup | null }) => string): Promise<Map<string, string[]>> {
  const pending = await db
    .select({ id: products.id, group: products.group, aiBatchKey: products.aiBatchKey, aiTier: products.aiTier })
    .from(products)
    .where(and(eq(products.lastImportId, importId), eq(products.status, "pending_ai")))
    .orderBy(asc(products.createdAt), asc(products.id));
  const byBatch = new Map<string, string[]>();
  const counters = new Map<string, number>();
  for (const p of pending) {
    let key = p.aiBatchKey;
    if (!key) {
      const tier = p.aiTier ?? tierOf(p);
      const n = counters.get(tier) ?? 0;
      counters.set(tier, n + 1);
      key = `import:${importId}:enrich:${tier}:${Math.floor(n / batchSize)}`;
      await db.update(products).set({ aiBatchKey: key, aiTier: tier }).where(eq(products.id, p.id));
    }
    const list = byBatch.get(key) ?? [];
    list.push(p.id);
    byBatch.set(key, list);
  }
  return byBatch;
}

export async function listPendingBatchKeys(db: DbOrTx, importId: string): Promise<Array<{ key: string; tier: string; productIds: string[] }>> {
  const rows = await db
    .select({ id: products.id, key: products.aiBatchKey, tier: products.aiTier })
    .from(products)
    .where(and(eq(products.lastImportId, importId), eq(products.status, "pending_ai")));
  const map = new Map<string, { tier: string; productIds: string[] }>();
  for (const r of rows) {
    if (!r.key) continue;
    const entry = map.get(r.key) ?? { tier: r.tier ?? "cheap", productIds: [] };
    entry.productIds.push(r.id);
    map.set(r.key, entry);
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v }));
}

export async function getProductsByIds(db: DbOrTx, ids: string[]): Promise<ProductRecord[]> {
  if (ids.length === 0) return [];
  return db.select().from(products).where(inArray(products.id, ids));
}

export async function getProduct(db: DbOrTx, storeId: string, productId: string): Promise<ProductRecord | null> {
  const [row] = await db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  return row ?? null;
}

export async function getVariants(db: DbOrTx, productId: string): Promise<VariantRecord[]> {
  return db.select().from(variants).where(eq(variants.productId, productId)).orderBy(asc(variants.position));
}

export async function countProductsByStatus(db: DbOrTx, importId: string): Promise<Record<string, number>> {
  const result = await db.execute<{ status: string; n: string }>(sql`
    select status, count(*)::text as n from products where last_import_id = ${importId} group by status
  `);
  const out: Record<string, number> = {};
  for (const r of result.rows) out[r.status] = Number(r.n);
  return out;
}

/** Products from an earlier import of the same file name that this import did not contain (EC-C11). */
export async function markProductsMissingFromImport(db: DbOrTx, storeId: string, importId: string, previousImportIds: string[]): Promise<number> {
  if (previousImportIds.length === 0) return 0;
  const rows = await db
    .update(products)
    .set({ missingFromImportId: importId, updatedAt: new Date() })
    .where(and(eq(products.storeId, storeId), inArray(products.lastImportId, previousImportIds), isNull(products.deletedAt)))
    .returning({ id: products.id });
  return rows.length;
}
