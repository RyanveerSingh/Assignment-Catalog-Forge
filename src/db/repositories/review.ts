import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { publishProduct, republishIfLive, unpublishProduct } from "@/jobs/publish";
import { auditLog, products, translations, type ProductContent } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { wakeWorker } from "@/lib/events";

/**
 * Merchant actions on products. Every change is audited, every edit becomes a manual override
 * that later AI runs and re-imports never overwrite (EC-F1–F7).
 */

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function updateProductDraft(
  db: Db,
  storeId: string,
  productId: string,
  patch: Partial<ProductContent>,
  expectedVersion: number,
  actorId: string | null,
): Promise<ActionResult & { version?: number }> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: products.id, draft: products.draft, manualOverrides: products.manualOverrides, version: products.version, status: products.status }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
    if (!p) return { ok: false, code: "not_found", message: "Product not found" };
    if (p.version !== expectedVersion) return { ok: false, code: "version_conflict", message: "This product was changed by someone else; reload to see the latest version" };
    const current: ProductContent = p.draft ?? { title: null, descriptionHtml: null, category: null, tags: [], attributes: {}, seo: { metaTitle: null, metaDescription: null } };
    const next: ProductContent = {
      ...current,
      ...patch,
      seo: { ...current.seo, ...(patch.seo ?? {}) },
      attributes: patch.attributes ?? current.attributes,
      tags: patch.tags ?? current.tags,
    };
    const overrides = { ...p.manualOverrides, ...patch };
    const changedFields = diffContent(current, next);
    await tx
      .update(products)
      .set({ draft: next, manualOverrides: overrides, version: p.version + 1, translatedAt: changedFields.length ? null : undefined, updatedAt: new Date() })
      .where(eq(products.id, productId));
    await tx.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "edit", diff: { fields: changedFields, before: pick(current, changedFields), after: pick(next, changedFields) } });
    wakeWorker();
    return { ok: true, version: p.version + 1 };
  });
}

function diffContent(a: ProductContent, b: ProductContent): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push("title");
  if (a.descriptionHtml !== b.descriptionHtml) out.push("descriptionHtml");
  if (a.category !== b.category) out.push("category");
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) out.push("tags");
  if (JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)) out.push("attributes");
  if (a.seo.metaTitle !== b.seo.metaTitle) out.push("seo.metaTitle");
  if (a.seo.metaDescription !== b.seo.metaDescription) out.push("seo.metaDescription");
  return out;
}

function pick(content: ProductContent, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f === "seo.metaTitle") out[f] = content.seo.metaTitle;
    else if (f === "seo.metaDescription") out[f] = content.seo.metaDescription;
    else out[f] = (content as unknown as Record<string, unknown>)[f];
  }
  return out;
}

export async function approveProduct(db: Db, storeId: string, productId: string, actorId: string | null, opts: { force?: boolean } = {}): Promise<ActionResult> {
  const [p] = await db.select({ status: products.status, draft: products.draft, deletedAt: products.deletedAt }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!p) return { ok: false, code: "not_found", message: "Product not found" };
  if (p.deletedAt) return { ok: false, code: "deleted", message: "Restore the product before approving it" };
  if (!p.draft) return { ok: false, code: "no_draft", message: "The AI has not written this product yet" };
  if (p.status === "needs_review" && !opts.force) return { ok: false, code: "needs_review", message: "This product needs review; confirm to approve anyway" };
  if (p.status === "pending_ai" || p.status === "failed") return { ok: false, code: "not_ready", message: `Product is ${p.status.replace("_", " ")}` };
  await db.update(products).set({ status: "approved", approvedAt: new Date(), sourceChangedAt: null, updatedAt: new Date() }).where(eq(products.id, productId));
  await publishProduct(db, productId);
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "approve", diff: { from: p.status, forced: Boolean(opts.force) } });
  return { ok: true };
}

export async function rejectProduct(db: Db, storeId: string, productId: string, actorId: string | null, reason: string | null): Promise<ActionResult> {
  const [p] = await db.select({ status: products.status }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!p) return { ok: false, code: "not_found", message: "Product not found" };
  await db.update(products).set({ status: "rejected", updatedAt: new Date() }).where(eq(products.id, productId));
  await unpublishProduct(db, productId);
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "reject", diff: { from: p.status, reason } });
  return { ok: true };
}

export async function sendBackProduct(db: Db, storeId: string, productId: string, actorId: string | null, reason: string): Promise<ActionResult> {
  const [p] = await db.select({ status: products.status, reviewReasons: products.reviewReasons }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!p) return { ok: false, code: "not_found", message: "Product not found" };
  const reasons = [...p.reviewReasons.filter((r) => !r.startsWith("Sent back:")), `Sent back: ${reason}`];
  await db.update(products).set({ status: "needs_review", reviewReasons: reasons, updatedAt: new Date() }).where(eq(products.id, productId));
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "send_back", diff: { from: p.status, reason } });
  return { ok: true };
}

/** Queue a fresh AI run; the published snapshot is untouched until re-approved (EC-F6). */
export async function rerunProductAi(db: Db, storeId: string, productId: string, actorId: string | null, opts: { tier?: "cheap" | "strong" | "vision" | "escalation"; promptVersion?: string }): Promise<ActionResult> {
  const [p] = await db.select({ status: products.status, lastImportId: products.lastImportId, group: products.group }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!p) return { ok: false, code: "not_found", message: "Product not found" };
  if (!p.group) return { ok: false, code: "no_source", message: "This product has no source rows to re-run from" };
  const batchKey = `rerun:${productId}:${Date.now()}`;
  await db
    .update(products)
    .set({ status: "pending_ai", aiBatchKey: batchKey, aiTier: opts.tier ?? null, promptVersion: opts.promptVersion ?? undefined, reviewReasons: [], updatedAt: new Date() })
    .where(eq(products.id, productId));
  const { enqueue } = await import("@/queue/queue");
  await enqueue(db, { key: batchKey, type: "products.enrich", queue: "ai", priority: 20, storeId, importId: p.lastImportId ?? undefined, payload: { productIds: [productId], tier: opts.tier ?? "cheap", rerun: true, promptVersion: opts.promptVersion } });
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "rerun_ai", diff: { from: p.status, tier: opts.tier ?? null, promptVersion: opts.promptVersion ?? null } });
  wakeWorker();
  return { ok: true };
}

export async function softDeleteProduct(db: Db, storeId: string, productId: string, actorId: string | null): Promise<ActionResult> {
  await db.update(products).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(products.storeId, storeId), eq(products.id, productId)));
  await unpublishProduct(db, productId);
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "delete", diff: null });
  return { ok: true };
}

export async function restoreProduct(db: Db, storeId: string, productId: string, actorId: string | null): Promise<ActionResult> {
  await db.update(products).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(products.storeId, storeId), eq(products.id, productId)));
  const [p] = await db.select({ status: products.status }).from(products).where(eq(products.id, productId)).limit(1);
  if (p?.status === "approved") await publishProduct(db, productId);
  await db.insert(auditLog).values({ storeId, actorId, entity: "product", entityId: productId, action: "restore", diff: null });
  return { ok: true };
}

export async function bulkApprove(db: Db, storeId: string, ids: string[], actorId: string | null, opts: { includeNeedsReview?: boolean }): Promise<{ approved: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const rows = await db.select({ id: products.id, status: products.status }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, ids)));
  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const r of rows) {
    if (r.status === "needs_review" && !opts.includeNeedsReview) {
      skipped.push({ id: r.id, reason: "needs review" });
      continue;
    }
    const res = await approveProduct(db, storeId, r.id, actorId, { force: Boolean(opts.includeNeedsReview) });
    if (res.ok) approved.push(r.id);
    else skipped.push({ id: r.id, reason: res.message ?? res.code ?? "skipped" });
  }
  return { approved, skipped };
}

/** A merchant's translation fix: wins over the AI, keyed to the current English (EC-F3). */
export async function setManualTranslation(db: Db, storeId: string, productId: string, field: string, locale: string, text: string, actorId: string | null): Promise<ActionResult> {
  const [p] = await db.select({ draft: products.draft }).from(products).where(and(eq(products.storeId, storeId), eq(products.id, productId))).limit(1);
  if (!p?.draft) return { ok: false, code: "not_found", message: "Product not found" };
  const english = englishFor(p.draft, field);
  const sourceHash = sha256Hex(english ?? "");
  await db
    .insert(translations)
    .values({ productId, storeId, field, locale, sourceHash, text, origin: "manual", status: "fresh", updatedAt: new Date() })
    .onConflictDoUpdate({ target: [translations.productId, translations.field, translations.locale], set: { sourceHash, text, origin: "manual", status: "fresh", error: null, updatedAt: new Date() } });
  await db.insert(auditLog).values({ storeId, actorId, entity: "translation", entityId: `${productId}:${field}:${locale}`, action: "manual_fix", diff: { text } });
  await republishIfLive(db, productId);
  return { ok: true };
}

function englishFor(content: ProductContent, field: string): string | null {
  if (field === "title") return content.title;
  if (field === "descriptionHtml") return content.descriptionHtml;
  if (field === "metaTitle") return content.seo.metaTitle;
  if (field === "metaDescription") return content.seo.metaDescription;
  if (field.startsWith("attributes.")) return content.attributes[field.slice("attributes.".length)] ?? null;
  return null;
}
