import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { Db } from "@/db/client";
import type { QueueName } from "@/db/schema";
import { getBus } from "@/lib/events";
import { getLogger } from "@/lib/logger";
import { errorMessage, isJobError } from "@/queue/errors";
import { claim, complete, fail, hasPendingWork, heartbeat, pauseQueue, reapStalled, type Job } from "@/queue/queue";

export interface JobContext {
  job: Job;
  db: Db;
  log: Logger;
  /** Aborted when the lease is lost or the worker is shutting down; long handlers should check it between batches. */
  signal: AbortSignal;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

export interface WorkerOptions {
  db: Db;
  handlers: Record<string, JobHandler>;
  queues: Array<{ name: QueueName; concurrency: number }>;
  workerId?: string;
  lockSeconds?: number;
  /** Called when a job has exhausted its attempts, so the owning rows/products can be marked Failed. */
  onDead?: (job: Job, error: string, db: Db) => Promise<void>;
  /** Periodic maintenance (reconciler ticks). Runs every `tickMs` while awake and once before sleeping. */
  onTick?: (db: Db) => Promise<void>;
  tickMs?: number;
  idle?: Partial<IdlePolicy>;
}

export interface IdlePolicy {
  /** Delay after an empty poll, doubling up to maxMs. */
  minMs: number;
  maxMs: number;
  /** After this much continuous idleness, check the table once and go to sleep if nothing is pending. */
  sleepAfterMs: number;
  /** While asleep, wake this often to re-check (lets a free-tier database autosuspend between checks, EC-E18). */
  sleepCheckMs: number;
}

const DEFAULT_IDLE: IdlePolicy = { minMs: 250, maxMs: 5_000, sleepAfterMs: 60_000, sleepCheckMs: 10 * 60_000 };

export interface WorkerHandle {
  stop(timeoutMs?: number): Promise<void>;
  wake(): void;
  inFlight(): number;
  isSleeping(): boolean;
}

/**
 * Start claim loops for each queue. Each loop claims a job, runs its handler under a heartbeat
 * that extends the lease, records the outcome, and immediately polls again. Empty polls back off
 * exponentially; after a minute of nothing the worker sleeps until something is enqueued in this
 * process (`wakeWorker()`) or ten minutes pass.
 */
export function startWorker(opts: WorkerOptions): WorkerHandle {
  const workerId = opts.workerId ?? `${process.pid}-${randomUUID().slice(0, 8)}`;
  const lockSeconds = opts.lockSeconds ?? 60;
  const idle: IdlePolicy = { ...DEFAULT_IDLE, ...opts.idle };
  const tickMs = opts.tickMs ?? 30_000;
  const log = getLogger({ component: "worker", workerId });
  const bus = getBus();

  let stopping = false;
  let sleeping = false;
  let inFlight = 0;
  let lastWorkAt = Date.now();
  const stopController = new AbortController();
  const loops: Promise<void>[] = [];

  // Wake-up plumbing: one resolver shared by all sleeping/backing-off loops.
  let wakeResolvers: Array<() => void> = [];
  const wake = (): void => {
    const rs = wakeResolvers;
    wakeResolvers = [];
    for (const r of rs) r();
  };
  const waitForWake = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        wakeResolvers = wakeResolvers.filter((r) => r !== resolve);
        resolve();
      }, ms);
      wakeResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  bus.on("queue:wake", wake);

  async function runTick(): Promise<void> {
    try {
      const reaped = await reapStalled(opts.db);
      if (reaped > 0) log.warn({ reaped }, "returned stalled jobs to the queue");
      if (opts.onTick) await opts.onTick(opts.db);
    } catch (err) {
      log.error({ err }, "maintenance tick failed");
    }
  }

  async function execute(job: Job): Promise<void> {
    const jobLog = log.child({ jobId: job.id, jobKey: job.key, jobType: job.type, importId: job.importId ?? undefined });
    const handler = opts.handlers[job.type];
    if (!handler) {
      const msg = `no handler registered for job type "${job.type}"`;
      jobLog.error(msg);
      const outcome = await fail(opts.db, job, workerId, msg, { retryable: false });
      if (outcome === "dead" && opts.onDead) await opts.onDead(job, msg, opts.db);
      return;
    }

    const leaseController = new AbortController();
    const abortOnStop = (): void => leaseController.abort();
    stopController.signal.addEventListener("abort", abortOnStop, { once: true });
    const hb = setInterval(() => {
      heartbeat(opts.db, job.id, workerId, lockSeconds)
        .then((ok) => {
          if (!ok) {
            jobLog.warn("lease lost; aborting handler");
            leaseController.abort();
          }
        })
        .catch((err: unknown) => jobLog.warn({ err }, "heartbeat failed"));
    }, Math.max(1_000, (lockSeconds * 1000) / 4));

    const started = Date.now();
    try {
      await handler({ job, db: opts.db, log: jobLog, signal: leaseController.signal });
      const ok = await complete(opts.db, job.id, workerId);
      if (!ok) jobLog.warn("job finished but the lease was already lost; result may be re-applied by another worker (idempotent)");
      else jobLog.info({ ms: Date.now() - started, attempt: job.attempts }, "job completed");
    } catch (err) {
      const message = errorMessage(err);
      if (isJobError(err) && err.pauseQueue) {
        const until = new Date(Date.now() + err.pauseQueue.untilMs);
        await pauseQueue(opts.db, err.pauseQueue.queue, until, err.pauseQueue.reason);
        await fail(opts.db, job, workerId, message, { retryable: true, retryAfterMs: 0, refundAttempt: true });
        jobLog.warn({ queue: err.pauseQueue.queue, until, reason: err.pauseQueue.reason }, "queue paused by job");
      } else {
        const retryable = isJobError(err) ? err.retryable : true;
        const retryAfterMs = isJobError(err) ? err.retryAfterMs : undefined;
        const outcome = await fail(opts.db, job, workerId, message, { retryable, retryAfterMs });
        jobLog.error({ err, outcome, attempt: job.attempts }, "job failed");
        if (outcome === "dead" && opts.onDead) {
          try {
            await opts.onDead(job, message, opts.db);
          } catch (deadErr) {
            jobLog.error({ err: deadErr }, "onDead hook failed");
          }
        }
      }
    } finally {
      clearInterval(hb);
      stopController.signal.removeEventListener("abort", abortOnStop);
    }
  }

  async function loop(queue: QueueName, slot: number): Promise<void> {
    const slotLog = log.child({ queue, slot });
    let delay = idle.minMs;
    while (!stopping) {
      let job: Job | null = null;
      try {
        job = await claim(opts.db, queue, workerId, lockSeconds);
      } catch (err) {
        slotLog.error({ err }, "claim failed; backing off");
        await waitForWake(idle.maxMs);
        continue;
      }
      if (job) {
        lastWorkAt = Date.now();
        sleeping = false;
        delay = idle.minMs;
        inFlight += 1;
        try {
          await execute(job);
        } finally {
          inFlight -= 1;
        }
        continue;
      }
      // Empty poll: back off, and after enough idleness go to sleep so the database can too.
      if (Date.now() - lastWorkAt > idle.sleepAfterMs && !sleeping && slot === 0) {
        await runTick();
        let pending = true;
        try {
          pending = await hasPendingWork(opts.db);
        } catch (err) {
          slotLog.warn({ err }, "pending-work check failed");
        }
        if (!pending && !stopping) {
          sleeping = true;
          slotLog.info("no pending work; sleeping");
        }
      }
      if (sleeping) {
        await waitForWake(idle.sleepCheckMs);
        if (sleeping) {
          // Woke by timer rather than by an enqueue: one cheap check before deciding to keep sleeping.
          sleeping = false;
          lastWorkAt = Date.now() - idle.sleepAfterMs - 1;
        }
        continue;
      }
      await waitForWake(delay);
      delay = Math.min(delay * 2, idle.maxMs);
    }
  }

  for (const q of opts.queues) {
    for (let i = 0; i < q.concurrency; i++) {
      loops.push(loop(q.name, i).catch((err: unknown) => log.error({ err, queue: q.name, slot: i }, "loop crashed")));
    }
  }

  const ticker = setInterval(() => {
    if (!sleeping && !stopping) void runTick();
  }, tickMs);
  void runTick();

  log.info({ queues: opts.queues, lockSeconds }, "worker started");

  return {
    wake,
    inFlight: () => inFlight,
    isSleeping: () => sleeping,
    async stop(timeoutMs = 30_000): Promise<void> {
      if (stopping) return;
      stopping = true;
      clearInterval(ticker);
      bus.off("queue:wake", wake);
      wake();
      const deadline = Date.now() + timeoutMs;
      // Let in-flight handlers finish; abort them if they overrun the deadline.
      while (inFlight > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      if (inFlight > 0) {
        log.warn({ inFlight }, "shutdown deadline reached; aborting in-flight jobs (they will be retried)");
        stopController.abort();
      }
      await Promise.allSettled(loops);
      log.info("worker stopped");
    },
  };
}
