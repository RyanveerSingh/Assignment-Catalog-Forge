import type { Db } from "@/db/client";
import type { QueueName } from "@/db/schema";
import type { Job } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { batchPollHandler, batchSubmitHandler } from "./batch";
import { cleanHandler } from "./clean";
import { driveAllActiveImports, driveImport } from "./drive";
import { enrichHandler, failEnrichBatch } from "./enrich";
import { finalizeHandler } from "./finalize";
import { groupHandler } from "./group";
import { JOB_TYPES } from "./keys";
import { photosHandler } from "./photos";
import { publishHandler } from "./publish";
import { translateHandler } from "./translate";
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

/** A dead job must leave nothing in limbo: rows and products it owned end as Failed with a reason (EC-E9). */
export async function onJobDead(job: Job, error: string, db: Db): Promise<void> {
  if (job.type === JOB_TYPES.enrich) {
    await failEnrichBatch(db, job, error);
    return;
  }
  if (job.type === JOB_TYPES.webhook) {
    await failWebhookDelivery(db, job, error);
    return;
  }
  if (job.importId) {
    const { appendImportEvent, getImportById, transitionImport } = await import("@/db/repositories/imports");
    const imp = await getImportById(db, job.importId);
    if (!imp) return;
    if (job.type === JOB_TYPES.ingest || job.type === JOB_TYPES.group || job.type === JOB_TYPES.finalize) {
      await transitionImport(db, job.importId, [imp.status], "failed", { error: `${job.type} failed repeatedly: ${error.slice(0, 500)}` });
      await appendImportEvent(db, job.importId, "error", `Import failed: ${error.slice(0, 300)}`, { jobType: job.type });
    } else {
      await appendImportEvent(db, job.importId, "error", `${job.type} gave up after ${job.attempts} attempts: ${error.slice(0, 300)}`);
      await driveImport(db, job.importId);
    }
  }
}

const COMPLETED_JOB_RETENTION_MS = 24 * 60 * 60_000;

/** Reconciler tick (EC-E10, E3) plus housekeeping: completed jobs older than a day are pruned. */
export async function onWorkerTick(db: Db): Promise<void> {
  await driveAllActiveImports(db);
  const { pruneCompleted } = await import("@/queue/queue");
  await pruneCompleted(db, COMPLETED_JOB_RETENTION_MS);
}
