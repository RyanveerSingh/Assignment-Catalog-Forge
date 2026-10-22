import { and, eq } from "drizzle-orm";
import { groundProductOutput } from "@/core/ai/grounding";
import { buildEnrichSystemPrompt, renderEnrichUserText, type EnrichInput } from "@/core/ai/prompts";
import { escalateTier, type AiTier } from "@/core/ai/routing";
import { aiEnrichBatchSchema, type AiEnrichBatch } from "@/core/ai/schema";
import type { ProductGroup } from "@/core/types";
import type { Db } from "@/db/client";
import { appendImportEvent, getImportById, pauseImport, recomputeImportCounts, updateImport } from "@/db/repositories/imports";
import { listPhotosForProducts } from "@/db/repositories/photos";
import { failProduct, getProductsByIds, setProductAiResult } from "@/db/repositories/products";
import { getRawCells, setRowsStatusForProduct } from "@/db/repositories/rows";
import { aiRequests, products, stores, type ProductClaim } from "@/db/schema";
import { refreshChaos } from "@/lib/app-settings";
import { decryptSecret, stableHash } from "@/lib/crypto";
import { getLogger } from "@/lib/logger";
import { getAiProvider, isAiError, modelForTier, type AiImage, type AiResponse } from "@/providers/ai";
import { getStorage } from "@/providers/storage";
import { JobError } from "@/queue/errors";
import type { Job } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { buildEnrichProductInput } from "./enrich-input";

const MAX_IMAGES_PER_PRODUCT = 3;
const MAX_TOKENS = 12_000;

/**
 * Stage 5+6: one model call for up to eight products of the same tier, then grounding validation.
 * Response-first persistence: the raw answer is stored in ai_requests before any product is updated,
 * so a crash after the call never re-bills and a re-upload of unchanged content is served from the
 * table (EC-D20, E2). Failure kinds map onto queue behaviour (EC-D8–D13, D15, D16, D19).
 */
export const enrichHandler: JobHandler = async ({ job, db, log }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("enrich job without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp) return;
  const rerun = job.payload.rerun === true;
  if (imp.status !== "enriching" && !rerun) {
    log.info({ status: imp.status }, "enrich skipped: import not enriching");
    return;
  }
  const productIds = (job.payload.productIds as string[] | undefined) ?? [];
  const requestedTier = (job.payload.tier as AiTier | "escalation" | undefined) ?? "cheap";
  let tier: AiTier = requestedTier === "escalation" ? "strong" : requestedTier;
  const promptVersion = typeof job.payload.promptVersion === "string" && job.payload.promptVersion ? job.payload.promptVersion : imp.promptVersion;
  const batch = (await getProductsByIds(db, productIds)).filter((p) => p.status === "pending_ai" && p.group);
  if (batch.length === 0) {
    await driveImport(db, importId);
    return;
  }

  // Retries after bad output escalate to the strong model (EC-D1); the third attempt splits the batch.
  if (job.attempts >= 2 && tier === "cheap") tier = escalateTier(tier);
  if (job.attempts >= 3 && batch.length > 1) {
    await splitBatch(db, job, batch.map((p) => p.id));
    await driveImport(db, importId);
    return;
  }

  const [store] = await db.select({ settings: stores.settings }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const storeKey = store?.settings.encryptedApiKey ? safeDecrypt(store.settings.encryptedApiKey) : null;
  await refreshChaos(db);
  const { provider, mode } = getAiProvider(storeKey);
  const model = modelForTier(requestedTier === "escalation" ? "escalation" : tier, mode);
  const purpose = tier === "vision" ? "vision" : "enrich";

  // Build the prompt from deterministic data + raw cells.
  const inputs = [];
  const images: AiImage[] = [];
  for (const p of batch) {
    const group = p.group as ProductGroup;
    const rows = await getRawCells(db, importId, group.sourceRows);
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
  const system = buildEnrichSystemPrompt(promptVersion);
  const userText = renderEnrichUserText(input);
  const requestHash = stableHash({ model, promptVersion, input, images: images.map((i) => i.name) });

  // Cache: same input + model + prompt version → reuse the stored answer, no call (EC-D20).
  let response: AiResponse<AiEnrichBatch> | null = null;
  let cached = false;
  const [prior] = await db
    .select({ response: aiRequests.response })
    .from(aiRequests)
    .where(and(eq(aiRequests.requestHash, requestHash), eq(aiRequests.status, "succeeded")))
    .limit(1);
  if (prior?.response) {
    const parsed = aiEnrichBatchSchema.safeParse((prior.response as { output?: unknown }).output);
    if (parsed.success) {
      response = { output: parsed.data, rawText: "", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model, latencyMs: 0, stopReason: "cached", costMicros: 0, batched: false };
      cached = true;
    }
  }

  if (!response) {
    const started = Date.now();
    try {
      response = await provider.complete({ purpose, model, system, userText, images, input, schema: aiEnrichBatchSchema, maxTokens: MAX_TOKENS, effort: tier === "cheap" ? "low" : "medium", customId: job.key });
    } catch (err) {
      await recordFailure(db, imp.storeId, importId, purpose, model, promptVersion, requestHash, job.attempts, err, Date.now() - started);
      throw await translateAiFailure(db, imp.id, job, batch.map((p) => p.id), err);
    }
    await db.insert(aiRequests).values({
      storeId: imp.storeId,
      importId,
      purpose,
      model,
      promptVersion,
      requestHash,
      customId: job.key,
      status: "succeeded",
      attempt: job.attempts,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cacheReadTokens: response.usage.cacheReadTokens,
      cacheWriteTokens: response.usage.cacheWriteTokens,
      costMicros: response.costMicros,
      latencyMs: response.latencyMs,
      response: { output: response.output, usage: response.usage, stopReason: response.stopReason },
    });
  }

  // Apply outputs; anything the model did not return goes back to the queue individually (EC-D6).
  const byKey = new Map(response.output.products.map((o) => [o.product_key, o] as const));
  const perProductCost = Math.round(response.costMicros / batch.length);
  const missing: string[] = [];
  let needsReview = 0;
  for (const p of batch) {
    const group = p.group as ProductGroup;
    const out = byKey.get(group.productKey);
    if (!out) {
      missing.push(p.id);
      continue;
    }
    const rows = await getRawCells(db, importId, group.sourceRows);
    const grounded = groundProductOutput({ output: out, group, rows });
    const claims: ProductClaim[] = grounded.claims.map((c) => ({ text: c.text, source: c.source, row: c.row, column: c.column, verified: true }));
    const applied = await setProductAiResult(db, p.id, {
      content: { title: grounded.content.title, descriptionHtml: grounded.content.descriptionHtml, category: grounded.content.category, tags: grounded.content.tags, attributes: grounded.content.attributes, seo: grounded.content.seo },
      claims,
      confidence: grounded.confidence,
      reviewReasons: grounded.reviewReasons,
      status: grounded.status,
      aiTier: requestedTier,
      aiModel: model,
      promptVersion,
      costMicros: perProductCost,
      latencyMs: response.latencyMs,
    });
    if (applied) {
      await setRowsStatusForProduct(db, p.id, grounded.status === "needs_review" ? "needs_review" : "done");
      if (grounded.status === "needs_review") needsReview += 1;
      if (grounded.removedClaims.length > 0) {
        await appendImportEvent(db, importId, "warn", `Removed ${grounded.removedClaims.length} unsupported claim(s) from "${grounded.content.title}"`, {
          productId: p.id,
          removed: grounded.removedClaims,
        });
      }
    }
  }
  if (missing.length > 0) {
    await splitBatch(db, job, missing);
    await appendImportEvent(db, importId, "warn", `The model skipped ${missing.length} product(s); re-queued individually`);
  }

  // Cost bookkeeping and the per-import budget guard (EC-D19).
  if (!cached && response.costMicros > 0) {
    const newTotal = imp.costMicros + response.costMicros;
    await updateImport(db, importId, { costMicros: newTotal });
    if (newTotal > imp.budgetCents * 10_000) {
      await pauseImport(db, importId, null, `Budget of $${(imp.budgetCents / 100).toFixed(2)} reached; raise it in Settings to continue`);
    }
  }
  await recomputeImportCounts(db, importId);
  log.info({ products: batch.length, tier, model, cached, needsReview, costMicros: response.costMicros, latencyMs: response.latencyMs }, "batch enriched");
  await driveImport(db, importId);
};

/** Give each product its own batch key so the driver re-enqueues them one by one (EC-D6). */
async function splitBatch(db: Db, job: Job, productIds: string[]): Promise<void> {
  for (const id of productIds) {
    await db.update(products).set({ aiBatchKey: `${job.key}:single:${id.slice(0, 8)}` }).where(and(eq(products.id, id), eq(products.status, "pending_ai")));
  }
}

async function recordFailure(db: Db, storeId: string, importId: string, purpose: "enrich" | "vision", model: string, promptVersion: string, requestHash: string, attempt: number, err: unknown, latencyMs: number): Promise<void> {
  await db.insert(aiRequests).values({
    storeId,
    importId,
    purpose,
    model,
    promptVersion,
    requestHash,
    status: "failed",
    attempt,
    latencyMs,
    error: err instanceof Error ? err.message.slice(0, 2000) : String(err),
  });
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
    case "invalid_json":
    case "max_tokens":
    case "timeout":
    case "network":
    case "unknown":
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

function safeDecrypt(value: string): string | null {
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}
