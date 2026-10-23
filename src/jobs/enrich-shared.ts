import { eq, sql } from "drizzle-orm";
import { groundProductOutput } from "@/core/ai/grounding";
import { buildEnrichSystemPrompt, renderEnrichUserText, type EnrichInput } from "@/core/ai/prompts";
import type { AiTier } from "@/core/ai/routing";
import { aiEnrichBatchSchema, type AiEnrichBatch } from "@/core/ai/schema";
import type { ProductGroup } from "@/core/types";
import type { Db } from "@/db/client";
import { appendImportEvent, pauseImport, recomputeImportCounts, type ImportRow } from "@/db/repositories/imports";
import { listPhotosForProducts } from "@/db/repositories/photos";
import { failProduct, setProductAiResult, type ProductRecord } from "@/db/repositories/products";
import { getRawCells, setRowsStatusForProduct } from "@/db/repositories/rows";
import { imports, products, stores, type ProductClaim } from "@/db/schema";
import { refreshChaos } from "@/lib/app-settings";
import { safeDecrypt, stableHash } from "@/lib/crypto";
import { getLogger } from "@/lib/logger";
import { getAiProvider, isAiError, modelForTier, type AiImage, type AiProvider, type AiRequest, type AiResponse } from "@/providers/ai";
import { getStorage } from "@/providers/storage";
import { JobError } from "@/queue/errors";
import type { Job } from "@/queue/queue";
import { driveImport } from "./drive";
import { buildEnrichProductInput } from "./enrich-input";

const MAX_IMAGES_PER_PRODUCT = 3;
// Haiku writes ~900 output tokens per product; eight products need headroom (EC-D16).
export const ENRICH_MAX_TOKENS = 16_000;

export type RequestedTier = AiTier | "escalation";

export interface PreparedRequest {
  request: AiRequest<AiEnrichBatch>;
  requestHash: string;
  model: string;
  purpose: "enrich" | "vision";
  provider: AiProvider;
  mode: "anthropic" | "mock";
}

/** The provider for an import's store: store key → server key → mock. */
export async function resolveProvider(db: Db, imp: ImportRow): Promise<{ provider: AiProvider; mode: "anthropic" | "mock" }> {
  const [store] = await db.select({ settings: stores.settings }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const storeKey = store?.settings.encryptedApiKey ? safeDecrypt(store.settings.encryptedApiKey) : null;
  await refreshChaos(db);
  return getAiProvider(storeKey);
}

/** Everything a model call needs for a batch of products, built from deterministic data + raw cells. */
export async function prepareEnrichRequest(db: Db, imp: ImportRow, batch: ProductRecord[], requestedTier: RequestedTier, promptVersion: string, customId: string): Promise<PreparedRequest> {
  const tier: AiTier = requestedTier === "escalation" ? "strong" : requestedTier;
  const [store] = await db.select({ settings: stores.settings }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const storeKey = store?.settings.encryptedApiKey ? safeDecrypt(store.settings.encryptedApiKey) : null;
  await refreshChaos(db);
  const { provider, mode } = getAiProvider(storeKey);
  const model = modelForTier(requestedTier === "escalation" ? "escalation" : tier, mode);
  const purpose = tier === "vision" ? "vision" : "enrich";

  const inputs = [];
  const images: AiImage[] = [];
  for (const p of batch) {
    const group = p.group as ProductGroup;
    const rows = await getRawCells(db, imp.id, group.sourceRows);
    const photoRows = await listPhotosForProducts(db, [p.id]);
    inputs.push(buildEnrichProductInput(group, rows, photoRows.map((r) => r.originalName)));
    if (tier === "vision") {
      for (const photo of photoRows.slice(0, MAX_IMAGES_PER_PRODUCT)) {
        const blob = await getStorage().get(imp.storeId, photo.thumbBlobId);
        if (blob) images.push({ mime: "image/webp", base64: blob.data.toString("base64"), name: photo.originalName });
      }
    }
  }
  const input: EnrichInput = { products: inputs };
  const requestHash = stableHash({ model, promptVersion, input, images: images.map((i) => i.name) });
  return {
    request: {
      purpose,
      model,
      system: buildEnrichSystemPrompt(promptVersion),
      userText: renderEnrichUserText(input),
      images,
      input,
      schema: aiEnrichBatchSchema,
      maxTokens: ENRICH_MAX_TOKENS,
      effort: tier === "cheap" ? "low" : "medium",
      customId,
    },
    requestHash,
    model,
    purpose,
    provider,
    mode,
  };
}

export interface ApplyResult {
  missing: string[];
  needsReview: number;
  applied: number;
}

/** Ground every returned product and store it as the draft; products the model skipped are reported back (EC-D6). */
export async function applyEnrichResponse(
  db: Db,
  imp: ImportRow,
  batch: ProductRecord[],
  response: AiResponse<AiEnrichBatch>,
  meta: { requestedTier: RequestedTier; model: string; promptVersion: string },
): Promise<ApplyResult> {
  const byKey = new Map(response.output.products.map((o) => [o.product_key, o] as const));
  const perProductCost = Math.round(response.costMicros / Math.max(1, batch.length));
  const missing: string[] = [];
  let needsReview = 0;
  let applied = 0;
  for (const p of batch) {
    const group = p.group as ProductGroup;
    const out = byKey.get(group.productKey);
    if (!out) {
      missing.push(p.id);
      continue;
    }
    const rows = await getRawCells(db, imp.id, group.sourceRows);
    const grounded = groundProductOutput({ output: out, group, rows });
    const claims: ProductClaim[] = grounded.claims.map((c) => ({ text: c.text, source: c.source, row: c.row, column: c.column, quote: c.quote, verified: true }));
    const ok = await setProductAiResult(db, p.id, {
      content: { title: grounded.content.title, descriptionHtml: grounded.content.descriptionHtml, category: grounded.content.category, tags: grounded.content.tags, attributes: grounded.content.attributes, seo: grounded.content.seo },
      claims,
      guardrails: grounded.blocked,
      confidence: grounded.confidence,
      reviewReasons: grounded.reviewReasons,
      status: grounded.status,
      aiTier: meta.requestedTier,
      aiModel: meta.model,
      promptVersion: meta.promptVersion,
      costMicros: perProductCost,
      latencyMs: response.latencyMs,
    });
    if (!ok) continue;
    applied += 1;
    await setRowsStatusForProduct(db, p.id, grounded.status === "needs_review" ? "needs_review" : "done");
    if (grounded.status === "needs_review") needsReview += 1;
    if (grounded.blocked.length > 0) {
      await appendImportEvent(db, imp.id, "warn", `Blocked ${grounded.blocked.length} claim(s) in "${grounded.content.title}" that the source does not support`, { productId: p.id, blocked: grounded.blocked });
    }
  }
  return { missing, needsReview, applied };
}

/** Charge the import and pause it when the budget is exhausted (EC-D19). */
export async function chargeImport(db: Db, imp: ImportRow, costMicros: number): Promise<void> {
  if (costMicros <= 0) return;
  // Atomic increment: six concurrent batches doing read-add-write lost each other's charges.
  const [row] = await db
    .update(imports)
    .set({ costMicros: sql`${imports.costMicros} + ${costMicros}`, updatedAt: new Date() })
    .where(eq(imports.id, imp.id))
    .returning({ costMicros: imports.costMicros });
  const newTotal = row?.costMicros ?? imp.costMicros + costMicros;
  if (newTotal > imp.budgetCents * 10_000) {
    await pauseImport(db, imp.id, null, `Budget of $${(imp.budgetCents / 100).toFixed(2)} reached; raise it in Settings and resume`);
  }
}

/** Give each product its own batch key so the driver re-enqueues them one by one (EC-D6). */
export async function splitBatch(db: Db, job: Job, productIds: string[], suffix = "single"): Promise<void> {
  for (const id of productIds) {
    await db.update(products).set({ aiBatchKey: `${job.key}:${suffix}:${id.slice(0, 8)}` }).where(eq(products.id, id));
  }
}

/** Split a batch in two with fresh keys; used when the answer for the whole batch was cut off (EC-D16). */
export async function halveBatch(db: Db, job: Job, productIds: string[]): Promise<void> {
  const half = Math.ceil(productIds.length / 2);
  for (const [i, id] of productIds.entries()) {
    await db.update(products).set({ aiBatchKey: `${job.key}:half${job.attempts}:${i < half ? "a" : "b"}` }).where(eq(products.id, id));
  }
}

/** Send products to the realtime path (used when the batch API errors or expires for them, EC-D14). */
export async function sendToRealtime(db: Db, productIds: string[], reason: string): Promise<void> {
  for (const id of productIds) {
    await db.update(products).set({ aiBatchKey: `rt:${id}:${Date.now()}`, updatedAt: new Date() }).where(eq(products.id, id));
  }
  void reason;
}

/** Map provider failures onto queue behaviour. Returns the JobError to throw. */
export async function translateAiFailure(db: Db, importId: string, job: Job, productIds: string[], err: unknown): Promise<JobError> {
  const log = getLogger({ component: "enrich", importId, jobId: job.id });
  if (!isAiError(err)) return new JobError(err instanceof Error ? err.message : String(err), { cause: err });
  switch (err.kind) {
    case "rate_limit": {
      const ms = err.retryAfterMs ?? 60_000;
      await pauseImport(db, importId, new Date(Date.now() + ms), `Rate limited by the AI provider; resuming in ${Math.ceil(ms / 60_000)} min`);
      return new JobError(err.message, { pauseQueue: { queue: "ai", untilMs: ms, reason: "Rate limited by the AI provider" }, cause: err });
    }
    case "overloaded": {
      const ms = err.retryAfterMs ?? 30_000;
      return new JobError(err.message, { pauseQueue: { queue: "ai", untilMs: ms, reason: "AI provider overloaded" }, cause: err });
    }
    case "auth":
    case "billing": {
      await pauseImport(db, importId, null, err.kind === "auth" ? "The AI API key was rejected. Fix it in Settings and resume." : "The AI account has no credit left. Add credit or a different key and resume.");
      return new JobError(err.message, { retryable: true, retryAfterMs: 10 * 60_000, cause: err });
    }
    case "bad_request":
    case "refusal": {
      for (const id of productIds) {
        await failProduct(db, id, err.kind === "refusal" ? "AI declined to process this product" : `AI request rejected: ${err.message}`);
        await setRowsStatusForProduct(db, id, "failed", err.kind === "refusal" ? "AI declined" : "AI request rejected");
      }
      await recomputeImportCounts(db, importId);
      await appendImportEvent(db, importId, "error", `${productIds.length} product(s) failed: ${err.message}`);
      log.warn({ kind: err.kind }, "non-retryable AI failure");
      return new JobError(err.message, { retryable: false, cause: err });
    }
    default:
      await appendImportEvent(db, importId, "warn", `AI call failed (${err.kind}); retrying with backoff`, { attempt: job.attempts });
      return new JobError(err.message, { retryable: true, cause: err });
  }
}

/** Mark a batch's products Failed when the job is dead, so counts still add up (EC-E9). */
export async function failEnrichBatch(db: Db, job: Job, reason: string): Promise<void> {
  const importId = job.importId;
  const productIds = (job.payload.productIds as string[] | undefined) ?? [];
  for (const id of productIds) {
    await failProduct(db, id, reason);
    await setRowsStatusForProduct(db, id, "failed", reason.slice(0, 500));
  }
  if (importId) {
    await recomputeImportCounts(db, importId);
    await appendImportEvent(db, importId, "error", `${productIds.length} product(s) failed after repeated AI errors: ${reason.slice(0, 200)}`);
    await driveImport(db, importId);
  }
}
