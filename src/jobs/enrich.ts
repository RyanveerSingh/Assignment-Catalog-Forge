import { and, eq } from "drizzle-orm";
import { escalateTier, type AiTier } from "@/core/ai/routing";
import { aiEnrichBatchSchema, type AiEnrichBatch } from "@/core/ai/schema";
import { appendImportEvent, getImportById, recomputeImportCounts } from "@/db/repositories/imports";
import { getProductsByIds } from "@/db/repositories/products";
import { aiRequests } from "@/db/schema";
import { isAiError, type AiResponse } from "@/providers/ai";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { applyEnrichResponse, chargeImport, halveBatch, prepareEnrichRequest, splitBatch, translateAiFailure, type RequestedTier } from "./enrich-shared";

export { failEnrichBatch } from "./enrich-shared";

/**
 * Fast mode, stage 5+6: one realtime model call for up to eight products of the same tier, then
 * grounding validation. Response-first persistence: the raw answer is stored in ai_requests before
 * any product is updated, so a crash after the call never re-bills and unchanged content is served
 * from the table (EC-D20, E2). Failure kinds map onto queue behaviour (EC-D8–D13, D15, D16, D19).
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
  let requestedTier: RequestedTier = (job.payload.tier as RequestedTier | undefined) ?? "cheap";
  const promptVersion = typeof job.payload.promptVersion === "string" && job.payload.promptVersion ? job.payload.promptVersion : imp.promptVersion;
  const batch = (await getProductsByIds(db, productIds)).filter((p) => p.status === "pending_ai" && p.group);
  if (batch.length === 0) {
    await driveImport(db, importId);
    return;
  }

  // Retries after bad output escalate to the strong model (EC-D1); the third attempt splits the batch.
  if (job.attempts >= 2 && requestedTier === "cheap") requestedTier = escalateTier("cheap" satisfies AiTier);
  if (job.attempts >= 3 && batch.length > 1) {
    await splitBatch(db, job, batch.map((p) => p.id));
    await driveImport(db, importId);
    return;
  }

  const prepared = await prepareEnrichRequest(db, imp, batch, requestedTier, promptVersion, job.key);

  // Cache: same input + model + prompt version → reuse the stored answer, no call (EC-D20).
  let response: AiResponse<AiEnrichBatch> | null = null;
  let cached = false;
  const [prior] = await db
    .select({ id: aiRequests.id, response: aiRequests.response })
    .from(aiRequests)
    .where(and(eq(aiRequests.requestHash, prepared.requestHash), eq(aiRequests.status, "succeeded")))
    .limit(1);
  if (prior?.response) {
    const parsed = aiEnrichBatchSchema.safeParse((prior.response as { output?: unknown }).output);
    if (parsed.success) {
      response = { output: parsed.data, rawText: "", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: prepared.model, latencyMs: 0, stopReason: "cached", costMicros: 0, batched: false };
      cached = true;
      // A zero-cost row so the import's cost report shows the work that was reused rather than hiding it.
      await db.insert(aiRequests).values({
        storeId: imp.storeId,
        importId,
        purpose: prepared.purpose,
        model: prepared.model,
        promptVersion,
        requestHash: prepared.requestHash,
        customId: job.key,
        status: "succeeded",
        attempt: job.attempts,
        latencyMs: 0,
        costMicros: 0,
        response: { output: parsed.data, cachedFrom: prior.id },
      });
    }
  }

  if (!response) {
    const started = Date.now();
    try {
      response = await prepared.provider.complete(prepared.request);
    } catch (err) {
      await db.insert(aiRequests).values({
        storeId: imp.storeId,
        importId,
        purpose: prepared.purpose,
        model: prepared.model,
        promptVersion,
        requestHash: prepared.requestHash,
        status: "failed",
        attempt: job.attempts,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message.slice(0, 2000) : String(err),
      });
      // A cut-off answer is deterministic: the same batch would be cut off again, so halve it instead (EC-D16).
      if (isAiError(err) && err.kind === "max_tokens" && batch.length > 1) {
        await halveBatch(db, job, batch.map((p) => p.id));
        await appendImportEvent(db, importId, "warn", `The model's answer for ${batch.length} products was cut off; re-queued as two smaller batches`);
        await driveImport(db, importId);
        return;
      }
      throw await translateAiFailure(db, imp.id, job, batch.map((p) => p.id), err);
    }
    await db.insert(aiRequests).values({
      storeId: imp.storeId,
      importId,
      purpose: prepared.purpose,
      model: prepared.model,
      promptVersion,
      requestHash: prepared.requestHash,
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

  const result = await applyEnrichResponse(db, imp, batch, response, { requestedTier, model: prepared.model, promptVersion });
  if (result.missing.length > 0) {
    await splitBatch(db, job, result.missing);
    await appendImportEvent(db, importId, "warn", `The model skipped ${result.missing.length} product(s); re-queued individually`);
  }
  if (!cached) await chargeImport(db, imp, response.costMicros);
  await recomputeImportCounts(db, importId);
  log.info({ products: batch.length, tier: requestedTier, model: prepared.model, cached, needsReview: result.needsReview, costMicros: response.costMicros, latencyMs: response.latencyMs }, "batch enriched");
  await driveImport(db, importId);
};
