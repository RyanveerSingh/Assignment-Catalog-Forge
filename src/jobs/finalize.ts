import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { appendImportEvent, getImportById, recomputeImportCounts, transitionImport, updateImport } from "@/db/repositories/imports";
import { markProductsMissingFromImport } from "@/db/repositories/products";
import { approveProduct } from "@/db/repositories/review";
import { failOpenRows } from "@/db/repositories/rows";
import { aiRequests, imports, photos, products, type ImportCostSummary } from "@/db/schema";
import { naiveCostMicros } from "@/providers/ai";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";
import { enqueueImportWebhooks } from "./webhook";

/**
 * Stage 8: assert the count invariant, summarise cost and savings, flag products that vanished
 * from a re-upload, and finish. If the numbers do not add up the import says so instead of
 * pretending to be done (EC-E9, C11).
 */
export const finalizeHandler: JobHandler = async ({ job, db, log }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("finalize job without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp || imp.status !== "finalizing") return;

  // Rows that never reached a terminal state are closed as Failed with a reason, never left hanging.
  const closed = await failOpenRows(db, importId, "Row was not processed; retry the import");
  if (closed > 0) await appendImportEvent(db, importId, "warn", `${closed} row(s) were never processed and were marked Failed`);
  const counts = await recomputeImportCounts(db, importId);
  const terminal = counts.done + counts.needs_review + counts.failed;
  const consistent = terminal === imp.totalRows && counts.pending === 0 && counts.processing === 0;

  const cost = await summariseCost(db, importId);
  const previous = await db
    .select({ id: imports.id })
    .from(imports)
    .where(and(eq(imports.storeId, imp.storeId), eq(imports.name, imp.name), ne(imports.id, importId), eq(imports.status, "completed")));
  const missing = await markProductsMissingFromImport(db, imp.storeId, importId, previous.map((p) => p.id));

  const durationMs = imp.startedAt ? Date.now() - imp.startedAt.getTime() : null;
  await updateImport(db, importId, { costSummary: cost, costMicros: cost.totalMicros });
  if (consistent) {
    await transitionImport(db, importId, "finalizing", "completed", { finishedAt: new Date() });
    await appendImportEvent(db, importId, "info", `Completed: ${counts.done} done, ${counts.needs_review} need review, ${counts.failed} failed`, {
      durationMs,
      rowsPerMinute: durationMs ? Math.round((imp.totalRows / durationMs) * 60_000) : null,
      costUsd: cost.totalMicros / 1_000_000,
      savedUsd: cost.savedMicros / 1_000_000,
      productsMissingFromThisUpload: missing,
    });
    if (imp.modelPolicy.autoPublish === true) await autoPublish(db, imp.storeId, importId);
  } else {
    await transitionImport(db, importId, "finalizing", "needs_attention", { finishedAt: new Date(), error: `Row counts do not add up: ${terminal} terminal of ${imp.totalRows}` });
    await appendImportEvent(db, importId, "error", `Needs attention: ${terminal} rows reached a final state but the sheet has ${imp.totalRows}`, { counts });
  }
  log.info({ counts, consistent, costMicros: cost.totalMicros }, "finalized");

  // Webhooks see the row as it now stands; a re-run cannot queue a second delivery for the same event (EC-I10).
  // The import is finished either way: a failure here is written to its log, not turned into a failed job.
  const finished = await getImportById(db, importId);
  if (finished && (finished.status === "completed" || finished.status === "needs_attention")) {
    try {
      const queued = await enqueueImportWebhooks(db, finished, finished.status === "completed" ? "import.completed" : "import.needs_attention");
      if (queued > 0) log.info({ queued }, "webhook deliveries queued");
    } catch (err) {
      log.error({ err }, "webhook deliveries could not be queued");
      await appendImportEvent(db, importId, "warn", `Webhooks could not be queued: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`);
    }
  }
};

const NO_PHOTO = "No photo: add one before it goes live";

/**
 * "Publish products that pass every check": approve (and so publish) every draft of this import,
 * and re-publish products that were already approved so a re-upload's new photos or text go live.
 * Products that need review keep waiting for a person; approval is the same audited path the
 * review drawer uses, so nothing is published that a reviewer could not have published (EC-F11).
 * A product with no matched photo is not "passing": a shop listing without a picture goes to review
 * with the reason "No photo" instead of going live.
 */
async function autoPublish(db: Parameters<JobHandler>[0]["db"], storeId: string, importId: string): Promise<void> {
  const drafts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.lastImportId, importId), inArray(products.status, ["draft", "approved"]), isNull(products.deletedAt)));
  const withPhoto = new Set(
    drafts.length === 0
      ? []
      : (
          await db
            .selectDistinct({ id: photos.productId })
            .from(photos)
            .where(and(inArray(photos.productId, drafts.map((d) => d.id)), eq(photos.status, "matched")))
        ).map((r) => r.id),
  );
  let published = 0;
  let noPhoto = 0;
  for (const p of drafts) {
    if (!withPhoto.has(p.id)) {
      await db
        .update(products)
        .set({ status: "needs_review", reviewReasons: sql`${products.reviewReasons} || ${JSON.stringify([NO_PHOTO])}::jsonb`, updatedAt: new Date() })
        .where(and(eq(products.id, p.id), sql`not (${products.reviewReasons} ? ${NO_PHOTO})`));
      noPhoto += 1;
      continue;
    }
    const result = await approveProduct(db, storeId, p.id, null);
    if (result.ok) published += 1;
  }
  const waiting = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.lastImportId, importId), eq(products.status, "needs_review")));
  const held = noPhoto > 0 ? ` (${noPhoto} held because they have no photo)` : "";
  await appendImportEvent(db, importId, "info", `Auto-published ${published} product(s) that passed every check; ${waiting[0]?.n ?? 0} waiting for review${held}`);
}

export async function summariseCost(db: Parameters<JobHandler>[0]["db"], importId: string): Promise<ImportCostSummary> {
  const rows = await db
    .select({
      model: aiRequests.model,
      purpose: aiRequests.purpose,
      inputTokens: aiRequests.inputTokens,
      outputTokens: aiRequests.outputTokens,
      cacheReadTokens: aiRequests.cacheReadTokens,
      cacheWriteTokens: aiRequests.cacheWriteTokens,
      costMicros: aiRequests.costMicros,
    })
    .from(aiRequests)
    .where(and(eq(aiRequests.importId, importId), eq(aiRequests.status, "succeeded")));
  const summary: ImportCostSummary = { totalMicros: 0, byModel: {}, byPurpose: {}, naiveMicros: 0, savedMicros: 0 };
  for (const r of rows) {
    summary.totalMicros += r.costMicros;
    const m = (summary.byModel[r.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costMicros: 0 });
    m.calls += 1;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.cacheReadTokens += r.cacheReadTokens;
    m.costMicros += r.costMicros;
    summary.byPurpose[r.purpose] = (summary.byPurpose[r.purpose] ?? 0) + r.costMicros;
    summary.naiveMicros += naiveCostMicros({ inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens });
  }
  summary.savedMicros = Math.max(0, summary.naiveMicros - summary.totalMicros);
  return summary;
}
