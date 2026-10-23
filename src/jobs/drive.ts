import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appendImportEvent, countRowsByStage, getImportById, listActiveImports, recomputeImportCounts, transitionImport, type ImportRow } from "@/db/repositories/imports";
import { countProductsByStatus, listPendingBatchKeys } from "@/db/repositories/products";
import { listChunksAtStage } from "@/db/repositories/rows";
import { importRows, imports, products } from "@/db/schema";
import { getLogger } from "@/lib/logger";
import { wakeWorker } from "@/lib/events";
import { enqueue, enqueueMany, type JobSpec } from "@/queue/queue";
import { JOB_TYPES, jobKeys, priorityFor } from "./keys";

/**
 * The orchestrator. Looks at what the database says about an import and enqueues whatever is
 * missing for the next stage. Every key is deterministic, so calling this a hundred times is
 * harmless. Called after every job, on worker boot, and on the 30 s safety tick (EC-E1, E3, E10).
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
    const inserted = await enqueueMany(db, specs);
    if (inserted > 0) {
      log.debug({ inserted, status: imp.status }, "enqueued");
      wakeWorker();
    }
  }
}

/**
 * Bulk enqueue of enrich batches for an import: one INSERT … SELECT grouped by batch key. Keys that are
 * already queued or running are left alone; finished keys are revived (same semantics as `enqueue`).
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
     where jobs.status in ('completed', 'failed', 'dead')
    returning key
  `);
  return result.rows.length;
}

/** Bulk enqueue of translate jobs for every product of an import that still needs translation. */
async function enqueueTranslateJobs(db: Db, imp: ImportRow): Promise<number> {
  const priority = priorityFor(imp.totalRows);
  const result = await db.execute<{ key: string }>(sql`
    insert into jobs (key, queue, type, payload, status, priority, run_at, attempts, max_attempts, store_id, import_id)
    select 'product:' || p.id || ':translate', 'translate', ${JOB_TYPES.translate},
           jsonb_build_object('productId', p.id), 'queued', ${priority}, now(), 0, 5, ${imp.storeId}::uuid, ${imp.id}::uuid
      from products p
     where p.last_import_id = ${imp.id} and p.status in ('draft', 'needs_review') and p.translated_at is null
    on conflict (key) do update
       set status = 'queued', payload = excluded.payload, priority = excluded.priority, run_at = now(),
           attempts = 0, locked_until = null, worker_id = null, last_error = null, completed_at = null,
           import_id = excluded.import_id, store_id = excluded.store_id, updated_at = now()
     where jobs.status in ('completed', 'failed', 'dead')
    returning key
  `);
  return result.rows.length;
}

/** Safety tick: advance every active import and reset rows stuck in processing (EC-E10). */
export async function driveAllActiveImports(db: Db): Promise<void> {
  const active = await listActiveImports(db);
  for (const imp of active) {
    try {
      await resetStuckRows(db, imp);
      await driveImport(db, imp.id);
    } catch (err) {
      getLogger({ component: "drive", importId: imp.id }).error({ err }, "drive failed");
    }
  }
  // Translations for products edited outside an import (manual edits) also need a driver. The job
  // keeps the product's import id so its cost is booked to that import and its completion drives it.
  const stale = await db
    .select({ id: products.id, storeId: products.storeId, importId: products.lastImportId })
    .from(products)
    .where(and(sql`${products.status} in ('draft','needs_review','approved')`, sql`${products.translatedAt} is null`, sql`${products.draft} is not null`, sql`${products.deletedAt} is null`))
    .limit(200);
  if (stale.length > 0) {
    await enqueueMany(
      db,
      stale.map((p) => ({ key: jobKeys.translate(p.id), type: JOB_TYPES.translate, payload: { productId: p.id }, storeId: p.storeId, importId: p.importId ?? undefined, queue: "translate" as const, priority: 60 })),
    );
  }
}

async function resetStuckRows(db: Db, imp: ImportRow): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
  const rows = await db
    .update(importRows)
    .set({ status: "pending", lockedAt: null, updatedAt: new Date() })
    .where(and(eq(importRows.importId, imp.id), eq(importRows.status, "processing"), sql`${importRows.lockedAt} < ${tenMinutesAgo}`))
    .returning({ id: importRows.id });
  if (rows.length > 0) {
    await appendImportEvent(db, imp.id, "warn", `Reset ${rows.length} rows stuck in processing`);
    await recomputeImportCounts(db, imp.id);
  }
}

/** Convenience for API routes: enqueue a drive run without blocking the request. */
export async function requestDrive(db: Db, importId: string, storeId: string): Promise<void> {
  await enqueue(db, { key: jobKeys.drive(importId), type: "import.drive", payload: {}, storeId, importId, priority: 10 });
  wakeWorker();
}
