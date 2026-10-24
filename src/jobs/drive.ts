import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appendImportEvent, countRowsByStage, getImportById, listActiveImports, transitionImport, type ImportRow } from "@/db/repositories/imports";
import { countProductsByStatus, listPendingBatchKeys } from "@/db/repositories/products";
import { listChunksAtStage } from "@/db/repositories/rows";
import { imports, products } from "@/db/schema";
import { getLogger } from "@/lib/logger";
import { wakeWorker } from "@/lib/events";
import { enqueue, enqueueMany, reviveDeadJobsForImport, type JobSpec } from "@/queue/queue";
import { JOB_TYPES, jobKeys, priorityFor } from "./keys";

/**
 * The orchestrator. Looks at what the database says about an import and enqueues whatever is
 * missing for the next stage. Every key is deterministic, so calling this a hundred times is
 * harmless. Called after every job, on worker boot, and on the 30 s safety tick (EC-E1, E3, E10).
 * It never revives a `dead` job: that job's owner was already closed out by `onJobDead`, and
 * re-running a poison job on every tick would loop forever. Only an explicit Retry does that.
 */
export async function driveImport(db: Db, importId: string): Promise<void> {
  const imp = await getImportById(db, importId);
  if (!imp) return;
  const log = getLogger({ component: "drive", importId });
  const base = { storeId: imp.storeId, importId, priority: priorityFor(imp.totalRows) };
  const specs: JobSpec[] = [];

  switch (imp.status) {
    case "uploading":
    case "completed":
    case "needs_attention":
    case "failed":
    case "cancelled":
      return;

    case "paused": {
      // Auto-resume once the pause has expired (rate limits); API-key pauses have no expiry (EC-D9, D12).
      if (imp.pausedUntil && imp.pausedUntil.getTime() <= Date.now()) {
        await db
          .update(imports)
          .set({ status: imp.resumeStatus ?? "queued", resumeStatus: null, pausedUntil: null, pauseReason: null, updatedAt: new Date() })
          .where(and(eq(imports.id, importId), eq(imports.status, "paused")));
        await appendImportEvent(db, importId, "info", "Pause expired; resuming");
        return driveImport(db, importId);
      }
      return;
    }

    case "queued": {
      if (await transitionImport(db, importId, "queued", "parsing", { startedAt: imp.startedAt ?? new Date() })) {
        await appendImportEvent(db, importId, "info", "Parsing the sheet");
      }
      specs.push({ key: jobKeys.ingest(importId), type: JOB_TYPES.ingest, ...base });
      break;
    }

    case "parsing": {
      // The ingest job moves the import to cleaning itself; if the job died, re-enqueue it.
      specs.push({ key: jobKeys.ingest(importId), type: JOB_TYPES.ingest, ...base });
      break;
    }

    case "cleaning": {
      const chunks = await listChunksAtStage(db, importId, "parsed");
      if (chunks.length === 0) {
        if (await transitionImport(db, importId, "cleaning", "grouping")) await appendImportEvent(db, importId, "info", "Grouping rows into products");
        specs.push({ key: jobKeys.group(importId), type: JOB_TYPES.group, ...base });
      } else {
        for (const chunk of chunks) specs.push({ key: jobKeys.clean(importId, chunk), type: JOB_TYPES.clean, payload: { chunk }, ...base });
      }
      break;
    }

    case "grouping": {
      const stages = await countRowsByStage(db, importId);
      const ungrouped = (stages.cleaned ?? 0) + (stages.parsed ?? 0);
      if (ungrouped === 0 && (stages.grouped ?? 0) + (stages.done ?? 0) > 0) {
        if (await transitionImport(db, importId, "grouping", "enriching")) await appendImportEvent(db, importId, "info", "Writing listings with AI");
        return driveImport(db, importId);
      }
      specs.push({ key: jobKeys.group(importId), type: JOB_TYPES.group, ...base });
      break;
    }

    case "enriching": {
      const byStatus = await countProductsByStatus(db, importId);
      if ((byStatus.pending_ai ?? 0) === 0) {
        if (await transitionImport(db, importId, "enriching", "translating")) await appendImportEvent(db, importId, "info", "Translating");
        return driveImport(db, importId);
      }
      if (imp.mode === "economy") {
        const batches = await listPendingBatchKeys(db, importId);
        if (batches.length === 0) {
          // Products pending but without a batch key: the group job assigns keys; ask it to run again.
          specs.push({ key: jobKeys.group(importId), type: JOB_TYPES.group, ...base });
          break;
        }
        // Batch API per tier; anything explicitly sent back to realtime (rt:…) or split after an error runs as a normal job.
        const realtime = batches.filter((b) => b.key.startsWith("rt:") || b.key.includes(":single:"));
        const batched = batches.filter((b) => !realtime.includes(b));
        for (const tier of new Set(batched.map((b) => b.tier))) specs.push({ key: jobKeys.batchSubmit(importId, tier), type: JOB_TYPES.batchSubmit, payload: { tier }, ...base, queue: "ai" });
        for (const b of realtime) specs.push({ key: jobKeys.enrich(b.key), type: JOB_TYPES.enrich, payload: { productIds: b.productIds, tier: b.tier }, ...base, queue: "ai" });
        break;
      }
      // Fast mode: one statement enqueues every missing batch, however many products are pending (EC-E13).
      const inserted = await enqueueEnrichBatches(db, imp);
      if (inserted > 0) wakeWorker();
      else {
        const keyed = await listPendingBatchKeys(db, importId);
        if (keyed.length === 0) specs.push({ key: jobKeys.group(importId), type: JOB_TYPES.group, ...base });
      }
      break;
    }

    case "translating": {
      const [pendingCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(products)
        .where(and(eq(products.lastImportId, importId), sql`${products.status} in ('draft','needs_review')`, sql`${products.translatedAt} is null`));
      if ((pendingCount?.n ?? 0) === 0) {
        if (await transitionImport(db, importId, "translating", "finalizing")) await appendImportEvent(db, importId, "info", "Finalizing");
        specs.push({ key: jobKeys.finalize(importId), type: JOB_TYPES.finalize, ...base });
      } else {
        const inserted = await enqueueTranslateJobs(db, imp);
        if (inserted > 0) wakeWorker();
      }
      break;
    }

    case "finalizing": {
      specs.push({ key: jobKeys.finalize(importId), type: JOB_TYPES.finalize, ...base });
      break;
    }
  }

  if (specs.length > 0) {
    const inserted = await enqueueMany(db, specs, { reviveDead: false });
    if (inserted > 0) {
      log.debug({ inserted, status: imp.status }, "enqueued");
      wakeWorker();
    }
  }
}

/**
 * Bulk enqueue of enrich batches for an import: one INSERT … SELECT grouped by batch key. Keys that are
 * already queued or running are left alone; completed keys are revived; dead keys are not.
 */
async function enqueueEnrichBatches(db: Db, imp: ImportRow): Promise<number> {
  const priority = priorityFor(imp.totalRows);
  const result = await db.execute<{ key: string }>(sql`
    insert into jobs (key, queue, type, payload, status, priority, run_at, attempts, max_attempts, store_id, import_id)
    select p.ai_batch_key, 'ai', ${JOB_TYPES.enrich},
           jsonb_build_object('productIds', jsonb_agg(p.id order by p.id), 'tier', coalesce(min(p.ai_tier), 'cheap')),
           'queued', ${priority}, now(), 0, 5, ${imp.storeId}::uuid, ${imp.id}::uuid
      from products p
     where p.last_import_id = ${imp.id} and p.status = 'pending_ai' and p.ai_batch_key is not null
     group by p.ai_batch_key
    on conflict (key) do update
       set status = 'queued', payload = excluded.payload, priority = excluded.priority, run_at = now(),
           attempts = 0, locked_until = null, worker_id = null, last_error = null, completed_at = null,
           import_id = excluded.import_id, store_id = excluded.store_id, updated_at = now()
     where jobs.status in ('completed', 'failed')
    returning key
  `);
  return result.rows.length;
}

/** Bulk enqueue of translate jobs for every product of an import that still needs translation. */
async function enqueueTranslateJobs(db: Db, imp: ImportRow): Promise<number> {
  return insertTranslateJobs(
    db,
    sql`p.last_import_id = ${imp.id} and p.status in ('draft', 'needs_review') and p.translated_at is null`,
    priorityFor(imp.totalRows),
    100_000,
  );
}

/**
 * One translate job per matching product. The payload carries a fingerprint of the draft: a dead
 * job is revived only when the English it gave up on has since changed, so a poison product is not
 * retried on every tick while an edited one still gets translated.
 */
async function insertTranslateJobs(db: Db, filter: SQL, priority: number, limit: number): Promise<number> {
  const result = await db.execute<{ key: string }>(sql`
    insert into jobs (key, queue, type, payload, status, priority, run_at, attempts, max_attempts, store_id, import_id)
    select 'product:' || p.id || ':translate', 'translate', ${JOB_TYPES.translate},
           jsonb_build_object('productId', p.id, 'draftHash', md5(p.draft::text)), 'queued', ${priority}, now(), 0, 5, p.store_id, p.last_import_id
      from products p
     where ${filter}
     limit ${limit}
    on conflict (key) do update
       set status = 'queued', payload = excluded.payload, priority = excluded.priority, run_at = now(),
           attempts = 0, locked_until = null, worker_id = null, last_error = null, completed_at = null,
           import_id = excluded.import_id, store_id = excluded.store_id, updated_at = now()
     where jobs.status in ('completed', 'failed')
        or (jobs.status = 'dead' and jobs.payload->>'draftHash' is distinct from excluded.payload->>'draftHash')
    returning key
  `);
  return result.rows.length;
}

/** Safety tick: advance every active import (EC-E10). Stalled jobs themselves are the reaper's. */
export async function driveAllActiveImports(db: Db): Promise<void> {
  const active = await listActiveImports(db);
  for (const imp of active) {
    try {
      await driveImport(db, imp.id);
    } catch (err) {
      getLogger({ component: "drive", importId: imp.id }).error({ err }, "drive failed");
    }
  }
  // Translations for products edited outside an import (manual edits) also need a driver. The job
  // keeps the product's import id so its cost is booked to that import and its completion drives it.
  // Dead jobs are skipped here too (unless the draft changed), so a poison product is not re-sent every 30 s.
  const inserted = await insertTranslateJobs(
    db,
    sql`p.status in ('draft','needs_review','approved') and p.translated_at is null and p.draft is not null and p.deleted_at is null`,
    60,
    200,
  );
  if (inserted > 0) wakeWorker();
}

/**
 * Entry point for user actions (upload, Resume, Retry): enqueue a drive run without blocking the
 * request. This is the one place dead jobs of the import come back with fresh attempts, because the
 * user explicitly asked for another try; the automatic reconciler never revives them.
 */
export async function requestDrive(db: Db, importId: string, storeId: string): Promise<void> {
  const revived = await reviveDeadJobsForImport(db, importId);
  if (revived > 0) await appendImportEvent(db, importId, "info", `Retrying ${revived} job(s) that had given up`);
  await enqueue(db, { key: jobKeys.drive(importId), type: "import.drive", payload: {}, storeId, importId, priority: 10 });
  wakeWorker();
}
