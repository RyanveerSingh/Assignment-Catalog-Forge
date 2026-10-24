import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { jobs, queueState, type JobStatus, type QueueName } from "@/db/schema";

/**
 * Postgres-backed job queue.
 *
 * Why not Redis: the free deployment has none, and keeping the queue in the same database as the
 * rows it processes makes "enqueue the next stage" and "mark these rows done" one transaction.
 * Why not pg-boss: we need deterministic job keys (re-enqueue is a no-op), per-queue pausing with
 * a reason the UI can show, and idle-aware polling so the free database can autosuspend.
 *
 * Guarantees:
 * - A key is in the table at most once. Enqueueing an existing queued/running job does nothing.
 * - `claim` hands a job to exactly one worker (FOR UPDATE SKIP LOCKED) and leases it until
 *   `locked_until`; `heartbeat` extends the lease; `reapStalled` returns expired leases to the queue.
 * - Failures (including lease expiries) retry with exponential backoff until `max_attempts`, then the
 *   job is `dead`. Only an explicit user action brings a dead job back.
 */

export type Job = typeof jobs.$inferSelect;

export interface JobSpec {
  key: string;
  type: string;
  queue?: QueueName;
  payload?: Record<string, unknown>;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  storeId?: string;
  importId?: string;
}

export const DEFAULT_LOCK_SECONDS = 60;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** 2s · 2^attempt with ±25% jitter, capped at five minutes. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_MS);
  const jitter = base * 0.25 * (random() * 2 - 1);
  return Math.round(base + jitter);
}

export interface EnqueueOptions {
  /**
   * Whether a `dead` job with the same key is brought back. True for explicit user actions (Retry,
   * re-run AI). The reconciler passes false: reviving a poison job on every tick pays for the same
   * failing model call forever and keeps its import from ever finishing.
   */
  reviveDead?: boolean;
}

/**
 * Insert a job. Returns `inserted: false` when the key already exists in a queued or running state.
 * A completed/failed job with the same key is revived; a dead one only when `reviveDead` (default true).
 */
export async function enqueue(db: DbOrTx, spec: JobSpec, opts: EnqueueOptions = {}): Promise<{ inserted: boolean }> {
  const revivable: JobStatus[] = opts.reviveDead === false ? ["completed", "failed"] : ["completed", "failed", "dead"];
  const rows = await db
    .insert(jobs)
    .values({
      key: spec.key,
      type: spec.type,
      queue: spec.queue ?? "default",
      payload: spec.payload ?? {},
      priority: spec.priority ?? 100,
      runAt: spec.runAt ?? new Date(),
      maxAttempts: spec.maxAttempts ?? 5,
      storeId: spec.storeId ?? null,
      importId: spec.importId ?? null,
    })
    .onConflictDoUpdate({
      target: jobs.key,
      set: {
        status: "queued",
        type: spec.type,
        queue: spec.queue ?? "default",
        payload: spec.payload ?? {},
        priority: spec.priority ?? 100,
        runAt: spec.runAt ?? new Date(),
        maxAttempts: spec.maxAttempts ?? 5,
        storeId: spec.storeId ?? null,
        importId: spec.importId ?? null,
        attempts: 0,
        lockedUntil: null,
        workerId: null,
        lastError: null,
        completedAt: null,
        updatedAt: new Date(),
      },
      setWhere: inArray(jobs.status, revivable),
    })
    .returning({ id: jobs.id });
  return { inserted: rows.length > 0 };
}

export async function enqueueMany(db: DbOrTx, specs: JobSpec[], opts: EnqueueOptions = {}): Promise<number> {
  let inserted = 0;
  for (const spec of specs) {
    const r = await enqueue(db, spec, opts);
    if (r.inserted) inserted += 1;
  }
  return inserted;
}

/** The explicit Retry path: give every dead job of an import a fresh set of attempts. */
export async function reviveDeadJobsForImport(db: DbOrTx, importId: string): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ status: "queued", attempts: 0, runAt: new Date(), lockedUntil: null, workerId: null, completedAt: null, updatedAt: new Date() })
    .where(and(eq(jobs.importId, importId), eq(jobs.status, "dead")))
    .returning({ id: jobs.id });
  return rows.length;
}

export async function isQueuePaused(db: DbOrTx, queue: QueueName): Promise<{ paused: boolean; until: Date | null; reason: string | null }> {
  const [row] = await db.select().from(queueState).where(eq(queueState.queue, queue));
  if (!row?.pausedUntil) return { paused: false, until: null, reason: null };
  const paused = row.pausedUntil.getTime() > Date.now();
  return { paused, until: paused ? row.pausedUntil : null, reason: paused ? row.pauseReason : null };
}

/**
 * Atomically take the next runnable job from a queue. Returns null when the queue is empty or paused.
 * Ordering: priority (lower first), then run_at, then id.
 */
export async function claim(
  db: DbOrTx,
  queue: QueueName,
  workerId: string,
  lockSeconds = DEFAULT_LOCK_SECONDS,
): Promise<Job | null> {
  const pause = await isQueuePaused(db, queue);
  if (pause.paused) return null;

  const result = await db.execute<Job>(sql`
    update jobs
       set status = 'running',
           locked_until = now() + make_interval(secs => ${lockSeconds}),
           attempts = attempts + 1,
           worker_id = ${workerId},
           updated_at = now()
     where id = (
       select id from jobs
        where queue = ${queue}
          and status = 'queued'
          and run_at <= now()
        order by priority asc, run_at asc, id asc
        for update skip locked
        limit 1
     )
    returning *
  `);
  const row = result.rows[0];
  return row ? normalizeJobRow(row) : null;
}

/** Extend the lease of a running job. Returns false if the job is no longer ours (lease lost). */
export async function heartbeat(db: DbOrTx, jobId: number, workerId: string, lockSeconds = DEFAULT_LOCK_SECONDS): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ lockedUntil: sql`now() + make_interval(secs => ${lockSeconds})`, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "running"), eq(jobs.workerId, workerId)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export async function complete(db: DbOrTx, jobId: number, workerId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "completed", completedAt: new Date(), lockedUntil: null, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "running"), eq(jobs.workerId, workerId)))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export interface FailOptions {
  retryable: boolean;
  retryAfterMs?: number;
  /** Do not count this attempt (used when a queue pause caused the failure). */
  refundAttempt?: boolean;
}

export type FailOutcome = "retry" | "dead" | "lost";

/** Record a failure; schedule a retry with backoff or mark the job dead. */
export async function fail(db: DbOrTx, job: Job, workerId: string, error: string, opts: FailOptions): Promise<FailOutcome> {
  const attempts = opts.refundAttempt ? Math.max(0, job.attempts - 1) : job.attempts;
  const exhausted = !opts.retryable || attempts >= job.maxAttempts;
  const delay = opts.retryAfterMs ?? backoffMs(attempts);
  const rows = await db
    .update(jobs)
    .set(
      exhausted
        ? { status: "dead", lastError: error.slice(0, 4000), lockedUntil: null, attempts, updatedAt: new Date() }
        : {
            status: "queued",
            lastError: error.slice(0, 4000),
            lockedUntil: null,
            workerId: null,
            attempts,
            runAt: new Date(Date.now() + delay),
            updatedAt: new Date(),
          },
    )
    .where(and(eq(jobs.id, job.id), eq(jobs.status, "running"), eq(jobs.workerId, workerId)))
    .returning({ id: jobs.id });
  if (rows.length === 0) return "lost";
  return exhausted ? "dead" : "retry";
}

export interface ReapResult {
  /** Jobs returned to the queue for another attempt. */
  requeued: number;
  /** Jobs that had already used their last attempt; the caller runs the same dead-job handling as `fail`. */
  dead: Job[];
}

/**
 * Return jobs whose lease expired (worker died) to the queue. The attempt already counted at claim
 * (EC-E10), so a job that keeps crashing its worker runs out of attempts here and is retired as dead
 * instead of being handed out forever: a crashed process never reaches `fail`.
 */
export async function reapStalled(db: DbOrTx): Promise<ReapResult> {
  const result = await db.execute<Record<string, unknown>>(sql`
    update jobs
       set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
           last_error = case when attempts >= max_attempts
                             then 'lease expired on the last attempt (worker stalled or died every time)'
                             else 'lease expired (worker stalled or died)' end,
           locked_until = null,
           worker_id = null,
           updated_at = now()
     where status = 'running' and locked_until < now()
    returning *
  `);
  const reaped = result.rows.map(normalizeJobRow);
  const dead = reaped.filter((j) => j.status === "dead");
  return { requeued: reaped.length - dead.length, dead };
}

export async function pauseQueue(db: DbOrTx, queue: QueueName, until: Date, reason: string): Promise<void> {
  await db
    .insert(queueState)
    .values({ queue, pausedUntil: until, pauseReason: reason, updatedAt: new Date() })
    .onConflictDoUpdate({ target: queueState.queue, set: { pausedUntil: until, pauseReason: reason, updatedAt: new Date() } });
}

export async function resumeQueue(db: DbOrTx, queue: QueueName): Promise<void> {
  await db
    .insert(queueState)
    .values({ queue, pausedUntil: null, pauseReason: null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: queueState.queue, set: { pausedUntil: null, pauseReason: null, updatedAt: new Date() } });
}

export interface QueueDepth {
  queued: number;
  running: number;
  dead: number;
}

export async function queueDepth(db: DbOrTx): Promise<Record<QueueName, QueueDepth>> {
  const result = await db.execute<{ queue: QueueName; status: JobStatus; n: string }>(sql`
    select queue, status, count(*)::text as n from jobs
     where status in ('queued','running','dead')
     group by queue, status
  `);
  const out: Record<QueueName, QueueDepth> = {
    default: { queued: 0, running: 0, dead: 0 },
    ai: { queued: 0, running: 0, dead: 0 },
    translate: { queued: 0, running: 0, dead: 0 },
    maintenance: { queued: 0, running: 0, dead: 0 },
  };
  for (const r of result.rows) {
    const bucket = out[r.queue];
    if (!bucket) continue;
    if (r.status === "queued") bucket.queued = Number(r.n);
    else if (r.status === "running") bucket.running = Number(r.n);
    else if (r.status === "dead") bucket.dead = Number(r.n);
  }
  return out;
}

/** True when any job is queued (now or later) or running. Drives idle-aware polling (EC-E18). */
export async function hasPendingWork(db: DbOrTx): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    select exists(select 1 from jobs where status in ('queued','running')) as "exists"
  `);
  return result.rows[0]?.exists === true;
}

/** Delete completed jobs older than the retention window. */
export async function pruneCompleted(db: DbOrTx, olderThanMs: number): Promise<number> {
  const rows = await db
    .delete(jobs)
    .where(and(eq(jobs.status, "completed"), lt(jobs.completedAt, new Date(Date.now() - olderThanMs))))
    .returning({ id: jobs.id });
  return rows.length;
}

/** Raw rows from `execute` come back with snake_case names and string bigints; normalise to the Drizzle shape. */
function normalizeJobRow(row: Record<string, unknown>): Job {
  const r = row as Record<string, unknown>;
  const date = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" ? new Date(v) : null);
  return {
    id: Number(r.id),
    key: String(r.key),
    queue: r.queue as QueueName,
    type: String(r.type),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status as JobStatus,
    priority: Number(r.priority),
    runAt: date(r.run_at) ?? new Date(),
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    lockedUntil: date(r.locked_until),
    workerId: (r.worker_id as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    storeId: (r.store_id as string | null) ?? null,
    importId: (r.import_id as string | null) ?? null,
    completedAt: date(r.completed_at),
    createdAt: date(r.created_at) ?? new Date(),
    updatedAt: date(r.updated_at) ?? new Date(),
  };
}
