import { and, eq, inArray } from "drizzle-orm";
import { aiEnrichBatchSchema } from "@/core/ai/schema";
import { appendImportEvent, getImportById, recomputeImportCounts } from "@/db/repositories/imports";
import { getProductsByIds, listPendingBatchKeys } from "@/db/repositories/products";
import { aiRequests } from "@/db/schema";
import { JobError } from "@/queue/errors";
import { enqueue } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { applyEnrichResponse, chargeImport, prepareEnrichRequest, resolveProvider, sendToRealtime, translateAiFailure, type RequestedTier } from "./enrich-shared";
import { JOB_TYPES, jobKeys, priorityFor } from "./keys";

const MAX_POLLS = 120; // ~2 h at the real interval; after that the remaining items fall back to realtime (EC-D14)

/** Real batches take minutes to hours; the mock finishes instantly, so poll it quickly in tests and demos. */
function pollIntervalMs(providerName: string): number {
  return providerName === "mock" ? 2_000 : 60_000;
}

/**
 * Economy mode: submit every pending batch of a tier as ONE Message Batch (half price), then poll.
 * Idempotent on restart: batches already recorded in ai_requests with a batch id are not resubmitted.
 */
export const batchSubmitHandler: JobHandler = async ({ job, db, log }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("batch submit without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp || imp.status !== "enriching") return;
  const tier = ((job.payload.tier as RequestedTier | undefined) ?? "cheap") satisfies RequestedTier;
  const pending = (await listPendingBatchKeys(db, importId)).filter((b) => b.tier === tier && !b.key.startsWith("rt:") && !b.key.includes(":single:"));
  if (pending.length === 0) {
    await driveImport(db, importId);
    return;
  }
  const already = await db
    .select({ customId: aiRequests.customId, batchId: aiRequests.batchId })
    .from(aiRequests)
    .where(and(eq(aiRequests.importId, importId), eq(aiRequests.status, "pending"), inArray(aiRequests.customId, pending.map((b) => b.key))));
  const submitted = new Set(already.map((a) => a.customId));
  const toSubmit = pending.filter((b) => !submitted.has(b.key));
  if (toSubmit.length === 0) {
    // Already in flight: make sure a poll job exists for each batch id.
    const { provider: p } = await resolveProvider(db, imp);
    for (const batchId of new Set(already.map((a) => a.batchId).filter((x): x is string => !!x))) {
      await enqueue(db, { key: jobKeys.batchPoll(importId, batchId), type: JOB_TYPES.batchPoll, queue: "ai", payload: { batchId, tier, poll: 0 }, storeId: imp.storeId, importId, runAt: new Date(Date.now() + pollIntervalMs(p.name)), priority: priorityFor(imp.totalRows) });
    }
    return;
  }

  const requests = [];
  const perKey = new Map<string, { productIds: string[]; requestHash: string; model: string; purpose: "enrich" | "vision" }>();
  let provider: Awaited<ReturnType<typeof prepareEnrichRequest>>["provider"] | null = null;
  for (const b of toSubmit) {
    const batch = (await getProductsByIds(db, b.productIds)).filter((p) => p.status === "pending_ai" && p.group);
    if (batch.length === 0) continue;
    const prepared = await prepareEnrichRequest(db, imp, batch, tier, imp.promptVersion, b.key);
    provider = prepared.provider;
    requests.push({ ...prepared.request, customId: b.key });
    perKey.set(b.key, { productIds: batch.map((p) => p.id), requestHash: prepared.requestHash, model: prepared.model, purpose: prepared.purpose });
  }
  if (!provider || requests.length === 0) {
    await driveImport(db, importId);
    return;
  }
  let handle;
  try {
    handle = await provider.createBatch(requests);
  } catch (err) {
    throw await translateAiFailure(db, importId, job, [...perKey.values()].flatMap((v) => v.productIds), err);
  }
  for (const [key, meta] of perKey) {
    await db.insert(aiRequests).values({ storeId: imp.storeId, importId, purpose: meta.purpose, model: meta.model, promptVersion: imp.promptVersion, requestHash: meta.requestHash, batchId: handle.batchId, customId: key, status: "pending", attempt: job.attempts });
  }
  const productCount = [...perKey.values()].reduce((n, v) => n + v.productIds.length, 0);
  await appendImportEvent(db, importId, "info", `Submitted ${productCount} product(s) in ${requests.length} request(s) to the batch API (about 50% cheaper); results usually arrive within an hour`, { batchId: handle.batchId, tier });
  await enqueue(db, { key: jobKeys.batchPoll(importId, handle.batchId), type: JOB_TYPES.batchPoll, queue: "ai", payload: { batchId: handle.batchId, tier, poll: 0 }, storeId: imp.storeId, importId, runAt: new Date(Date.now() + pollIntervalMs(provider.name)), priority: priorityFor(imp.totalRows) });
  log.info({ batchId: handle.batchId, requests: requests.length, products: productCount }, "batch submitted");
};

export const batchPollHandler: JobHandler = async ({ job, db, log }) => {
  const importId = job.importId;
  const batchId = job.payload.batchId as string | undefined;
  if (!importId || !batchId) throw new JobError("batch poll needs importId and batchId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp) return;
  const tier = ((job.payload.tier as RequestedTier | undefined) ?? "cheap") satisfies RequestedTier;
  const poll = Number(job.payload.poll ?? 0);
  const rows = await db.select().from(aiRequests).where(and(eq(aiRequests.batchId, batchId), eq(aiRequests.status, "pending")));
  if (rows.length === 0) {
    await driveImport(db, importId);
    return;
  }
  const first = rows[0]!;
  const batchProducts = await listPendingBatchKeys(db, importId);
  const productIdsByKey = new Map(batchProducts.map((b) => [b.key, b.productIds] as const));
  const { provider } = await resolveProvider(db, imp);

  let status;
  try {
    status = await provider.batchStatus(batchId);
  } catch (err) {
    throw await translateAiFailure(db, importId, job, [], err);
  }

  if (status.status !== "ended") {
    if (poll >= MAX_POLLS) {
      const ids = rows.flatMap((r) => productIdsByKey.get(r.customId ?? "") ?? []);
      await sendToRealtime(db, ids, "batch too slow");
      await db.update(aiRequests).set({ status: "failed", error: "batch did not finish in time; moved to realtime" }).where(and(eq(aiRequests.batchId, batchId), eq(aiRequests.status, "pending")));
      await appendImportEvent(db, importId, "warn", `Batch ${batchId} did not finish in ${MAX_POLLS} minutes; ${ids.length} product(s) moved to the realtime path`);
      await driveImport(db, importId);
      return;
    }
    await enqueue(db, { key: `${jobKeys.batchPoll(importId, batchId)}:${poll + 1}`, type: JOB_TYPES.batchPoll, queue: "ai", payload: { batchId, tier, poll: poll + 1 }, storeId: imp.storeId, importId, runAt: new Date(Date.now() + pollIntervalMs(provider.name)), priority: priorityFor(imp.totalRows) });
    log.info({ batchId, poll, counts: status.counts }, "batch still processing");
    return;
  }

  let totalCost = 0;
  let applied = 0;
  const fallback: string[] = [];
  const seen = new Set<string>();
  for await (const result of provider.batchResults(batchId, aiEnrichBatchSchema)) {
    const row = rows.find((r) => r.customId === result.customId);
    if (!row) continue;
    seen.add(result.customId);
    const productIds = productIdsByKey.get(result.customId) ?? [];
    if (result.result.type === "succeeded") {
      const response = result.result.response;
      await db
        .update(aiRequests)
        .set({ status: "succeeded", inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, cacheReadTokens: response.usage.cacheReadTokens, cacheWriteTokens: response.usage.cacheWriteTokens, costMicros: response.costMicros, latencyMs: response.latencyMs, response: { output: response.output, usage: response.usage, stopReason: response.stopReason } })
        .where(eq(aiRequests.id, row.id));
      const batch = (await getProductsByIds(db, productIds)).filter((p) => p.status === "pending_ai" && p.group);
      const r = await applyEnrichResponse(db, imp, batch, response, { requestedTier: tier, model: row.model, promptVersion: imp.promptVersion });
      applied += r.applied;
      if (r.missing.length) fallback.push(...r.missing);
      totalCost += response.costMicros;
    } else {
      const reason = result.result.type === "errored" ? result.result.error : result.result.type;
      await db.update(aiRequests).set({ status: "failed", error: reason }).where(eq(aiRequests.id, row.id));
      fallback.push(...productIds);
    }
  }
  // A request the provider never answered (or a batch id this process cannot see any more) must not
  // leave its products pending forever: close the request and send them to the realtime path (EC-D14).
  for (const row of rows) {
    if (!row.customId || seen.has(row.customId)) continue;
    await db.update(aiRequests).set({ status: "failed", error: "no result returned for this request" }).where(eq(aiRequests.id, row.id));
    fallback.push(...(productIdsByKey.get(row.customId) ?? []));
  }
  if (fallback.length > 0) {
    await sendToRealtime(db, fallback, "batch item failed");
    await appendImportEvent(db, importId, "warn", `${fallback.length} product(s) did not come back from the batch; running them on the realtime path`);
  }
  await chargeImport(db, imp, totalCost);
  await recomputeImportCounts(db, importId);
  await appendImportEvent(db, importId, "info", `Batch ${batchId} finished: ${applied} product(s) written, ${fallback.length} sent to realtime`, { costMicros: totalCost, purpose: first.purpose });
  log.info({ batchId, applied, fallback: fallback.length, costMicros: totalCost }, "batch results applied");
  await driveImport(db, importId);
};
