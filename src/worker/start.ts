import { closeDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { buildHandlers, onJobDead, onWorkerTick, QUEUE_LAYOUT } from "@/jobs/registry";
import { getConfig } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import { startWorker, type WorkerHandle } from "./loop";

declare global {
  var __catalogforgeWorker: WorkerHandle | undefined;
}

/**
 * Boot the worker: migrate, then start claim loops. Idempotent per process so Next.js
 * hot reloads and double `instrumentation` calls never start a second worker.
 */
export async function ensureWorkerStarted(): Promise<WorkerHandle> {
  if (globalThis.__catalogforgeWorker) return globalThis.__catalogforgeWorker;
  const cfg = getConfig();
  await runMigrations();
  const concurrencyScale = Math.max(1, cfg.WORKER_CONCURRENCY) / 4;
  const handle = startWorker({
    db: getDb(),
    handlers: buildHandlers(),
    queues: QUEUE_LAYOUT.map((q) => ({
      name: q.name,
      // Both model-call queues follow AI_CONCURRENCY; the rest scale with WORKER_CONCURRENCY.
      concurrency: q.name === "ai" || q.name === "translate" ? cfg.AI_CONCURRENCY : Math.max(1, Math.round(q.concurrency * concurrencyScale)),
    })),
    onDead: onJobDead,
    onTick: onWorkerTick,
  });
  globalThis.__catalogforgeWorker = handle;
  return handle;
}

/**
 * The chaos panel's "crash": the embedded worker drops its jobs mid-flight and a fresh one (new
 * worker id) starts two seconds later, so the reaper's lease recovery is exercised while the HTTP
 * server keeps serving (EC-E1, E16). Returns null when this process has no embedded worker.
 */
export function crashWorker(restartAfterMs = 2_000): { dropped: number } | null {
  const handle = globalThis.__catalogforgeWorker;
  if (!handle) return null;
  globalThis.__catalogforgeWorker = undefined;
  const dropped = handle.crash();
  setTimeout(() => {
    ensureWorkerStarted().catch((err: unknown) => getLogger({ component: "worker" }).error({ err }, "worker restart after simulated crash failed"));
  }, restartAfterMs);
  return { dropped };
}

/** Graceful shutdown used by both the standalone worker and the embedded one (EC-E14). */
export async function stopWorker(timeoutMs = 30_000): Promise<void> {
  const handle = globalThis.__catalogforgeWorker;
  if (!handle) return;
  globalThis.__catalogforgeWorker = undefined;
  await handle.stop(timeoutMs);
  await closeDb();
  getLogger({ component: "worker" }).info("shutdown complete");
}
