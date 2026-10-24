import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appendImportEvent, getImportById, recomputeImportCounts, transitionImport } from "@/db/repositories/imports";
import { failChunkRows, ROW_CHUNK_SIZE } from "@/db/repositories/rows";
import { aiRequests, jobs, products, type QueueName } from "@/db/schema";
import { getLogger } from "@/lib/logger";
import type { Job } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { batchPollHandler, batchSubmitHandler } from "./batch";
import { cleanHandler } from "./clean";
import { driveAllActiveImports, driveImport } from "./drive";
import { enrichHandler, failEnrichBatch } from "./enrich";
import { sendToRealtime } from "./enrich-shared";
import { finalizeHandler } from "./finalize";
import { groupHandler } from "./group";
import { JOB_TYPES } from "./keys";
import { photosHandler } from "./photos";
import { publishHandler } from "./publish";
import { failProductTranslations, translateHandler } from "./translate";
import { failWebhookDelivery, webhookHandler } from "./webhook";

/**
 * Every job type the worker knows about. Keep the map explicit (no dynamic imports) so a typo in a
 * job type fails at build time.
 */
export function buildHandlers(): Record<string, JobHandler> {
  return {
    "import.drive": async ({ job, db }) => {
      if (job.importId) await driveImport(db, job.importId);
    },
    [JOB_TYPES.ingest]: ingestLazy,
    [JOB_TYPES.clean]: cleanHandler,
    [JOB_TYPES.group]: groupHandler,
    [JOB_TYPES.photos]: photosHandler,
    [JOB_TYPES.enrich]: enrichHandler,
    [JOB_TYPES.batchSubmit]: batchSubmitHandler,
    [JOB_TYPES.batchPoll]: batchPollHandler,
    [JOB_TYPES.translate]: translateHandler,
    [JOB_TYPES.finalize]: finalizeHandler,
    [JOB_TYPES.publish]: publishHandler,
    [JOB_TYPES.webhook]: webhookHandler,
  };
}

// The ingest handler pulls in SheetJS; load it on first use so the web process boots fast.
const ingestLazy: JobHandler = async (ctx) => {
  const { ingestHandler } = await import("./ingest");
  return ingestHandler(ctx);
};

export const QUEUE_LAYOUT: Array<{ name: QueueName; concurrency: number }> = [
  { name: "default", concurrency: 2 },
  { name: "ai", concurrency: 4 },
  // Translation is one ~7 s model call per product and locale; it needs the same parallelism as enrichment.
  { name: "translate", concurrency: 4 },
  { name: "maintenance", concurrency: 1 },
];

/**
 * A dead job must leave nothing in limbo: rows and products it owned end as Failed with a reason, and
 * the import moves on (EC-E9). Called by the worker when `fail` or the reaper retires a job, and again
 * by the reconciler for any dead job whose work is still open. Must therefore be idempotent.
 */
export async function onJobDead(job: Job, error: string, db: Db): Promise<void> {
  if (job.type === JOB_TYPES.enrich) {
    await failEnrichBatch(db, job, error);
    return;
  }
  if (job.type === JOB_TYPES.webhook) {
    await failWebhookDelivery(db, job, error);
    return;
  }
  if (job.type === JOB_TYPES.translate) {
    await failTranslateJob(db, job, error);
    return;
  }
  if (!job.importId) return;
  const imp = await getImportById(db, job.importId);
  if (!imp) return;
  const importId = job.importId;
  switch (job.type) {
    case JOB_TYPES.ingest:
    case JOB_TYPES.group:
    case JOB_TYPES.finalize:
      await transitionImport(db, importId, [imp.status], "failed", { error: `${job.type} failed repeatedly: ${error.slice(0, 500)}` });
      await appendImportEvent(db, importId, "error", `Import failed: ${error.slice(0, 300)}`, { jobType: job.type });
      return;
    case JOB_TYPES.clean: {
      const chunk = Number(job.payload.chunk);
      const failed = Number.isInteger(chunk) ? await failChunkRows(db, importId, chunk, `Cleaning failed repeatedly: ${error}`) : 0;
      await recomputeImportCounts(db, importId);
      await appendImportEvent(db, importId, "error", `Cleaning chunk ${chunk} gave up after ${job.attempts} attempts; ${failed} row(s) marked Failed: ${error.slice(0, 300)}`);
      break;
    }
    case JOB_TYPES.batchSubmit: {
      // The batch API would not take this tier's products; the realtime path still can.
      const tier = typeof job.payload.tier === "string" ? job.payload.tier : "cheap";
      const pending = await db
        .select({ id: products.id, key: products.aiBatchKey })
        .from(products)
        .where(and(eq(products.lastImportId, importId), eq(products.status, "pending_ai"), eq(products.aiTier, tier)));
      const ids = pending.filter((p) => p.key && !p.key.startsWith("rt:") && !p.key.includes(":single:")).map((p) => p.id);
      await sendToRealtime(db, ids, "batch submit gave up");
      await appendImportEvent(db, importId, "warn", `Batch submission gave up (${error.slice(0, 200)}); ${ids.length} product(s) moved to the realtime path`);
      break;
    }
    case JOB_TYPES.batchPoll: {
      const batchId = typeof job.payload.batchId === "string" ? job.payload.batchId : null;
      if (batchId) {
        const open = await db
          .update(aiRequests)
          .set({ status: "failed", error: `polling gave up: ${error.slice(0, 500)}` })
          .where(and(eq(aiRequests.batchId, batchId), eq(aiRequests.status, "pending")))
          .returning({ customId: aiRequests.customId });
        const keys = open.map((r) => r.customId).filter((k): k is string => !!k);
        const stuck = keys.length
          ? await db.select({ id: products.id }).from(products).where(and(eq(products.lastImportId, importId), eq(products.status, "pending_ai"), inArray(products.aiBatchKey, keys)))
          : [];
        await sendToRealtime(db, stuck.map((p) => p.id), "batch poll gave up");
        await appendImportEvent(db, importId, "warn", `Polling batch ${batchId} gave up (${error.slice(0, 200)}); ${stuck.length} product(s) moved to the realtime path`);
      }
      break;
    }
    default:
      await appendImportEvent(db, importId, "error", `${job.type} gave up after ${job.attempts} attempts: ${error.slice(0, 300)}`);
  }
  await driveImport(db, importId);
}

/** Fall back to English for whatever this product's translate job could not do, then let the import finalize. */
async function failTranslateJob(db: Db, job: Job, error: string): Promise<void> {
  const productId = typeof job.payload.productId === "string" ? job.payload.productId : null;
  if (!productId) return;
  const failed = await failProductTranslations(db, productId, error);
  if (job.importId) {
    await appendImportEvent(db, job.importId, "warn", `Translation gave up after ${job.attempts} attempts; English will be shown for ${failed} field(s)`, { productId, error: error.slice(0, 300) });
    await driveImport(db, job.importId);
  }
}

/** Give a just-retired job's own onDead call time to finish before the reconciler steps in. */
const DEAD_SETTLE_GRACE = "1 minute";
const DEAD_SETTLE_BATCH = 50;

/**
 * Dead jobs whose owned work is still open: their onDead never ran or failed (process died, database
 * blip). The reconciler no longer revives dead jobs, so without this an import could wait on them
 * forever. Each condition below is "the thing onDead would have closed is still open".
 */
export async function settleUnhandledDeadJobs(db: Db): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    select j.id::text as id from jobs j
     where j.status = 'dead' and j.updated_at < now() - ${DEAD_SETTLE_GRACE}::interval
       and (
         (j.type = ${JOB_TYPES.translate} and exists (
            select 1 from products p
             where p.id::text = j.payload->>'productId' and p.translated_at is null and p.deleted_at is null
               and p.status in ('draft', 'needs_review', 'approved')
               and coalesce(j.payload->>'draftHash', md5(p.draft::text)) = md5(p.draft::text)))
         or (j.type = ${JOB_TYPES.clean} and exists (
            select 1 from import_rows r join imports i on i.id = r.import_id
             where r.import_id = j.import_id and i.status = 'cleaning' and r.stage = 'parsed'
               and (r.row_number - 1) / ${ROW_CHUNK_SIZE} = (j.payload->>'chunk')::int))
         or (j.type = ${JOB_TYPES.enrich} and exists (
            select 1 from products p where p.ai_batch_key = j.key and p.status = 'pending_ai'))
         or (j.type = ${JOB_TYPES.batchPoll} and exists (
            select 1 from ai_requests a where a.batch_id = j.payload->>'batchId' and a.status = 'pending'))
       )
     order by j.updated_at
     limit ${DEAD_SETTLE_BATCH}
  `);
  if (result.rows.length === 0) return 0;
  const dead = await db.select().from(jobs).where(inArray(jobs.id, result.rows.map((r) => Number(r.id))));
  const log = getLogger({ component: "reconciler" });
  for (const job of dead) {
    try {
      await onJobDead(job, job.lastError ?? "job gave up", db);
      // Mark it handled so a later tick does not pick it up again if the work stays open for another reason.
      await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, job.id));
    } catch (err) {
      log.error({ err, jobId: job.id, jobKey: job.key }, "settling a dead job failed");
    }
  }
  log.warn({ settled: dead.length }, "closed out dead jobs whose onDead never completed");
  return dead.length;
}

const COMPLETED_JOB_RETENTION_MS = 24 * 60 * 60_000;

/** Reconciler tick (EC-E10, E3) plus housekeeping: completed jobs older than a day are pruned. */
export async function onWorkerTick(db: Db): Promise<void> {
  await settleUnhandledDeadJobs(db);
  await driveAllActiveImports(db);
  const { pruneCompleted } = await import("@/queue/queue");
  await pruneCompleted(db, COMPLETED_JOB_RETENTION_MS);
}
