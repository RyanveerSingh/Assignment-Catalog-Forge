import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { Db } from "@/db/client";
import type { QueueName } from "@/db/schema";
import { getBus } from "@/lib/events";
import { getLogger } from "@/lib/logger";
import { errorMessage, isJobError } from "@/queue/errors";
import { claim, complete, fail, hasPendingWork, heartbeat, pauseQueue, reapStalled, type FailOutcome, type Job } from "@/queue/queue";

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
  /** First delay before retrying a failed outcome write (doubles per try). Tests shorten it. */
  outcomeRetryMs?: number;
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
/** After this many back-to-back refunded pauses for one job, further pauses burn an attempt. */
export const MAX_PAUSE_REFUNDS = 5;
const OUTCOME_WRITE_ATTEMPTS = 3;

export interface WorkerHandle {
  stop(timeoutMs?: number): Promise<void>;
  /**
   * Simulate a process crash without one: abort every handler mid-flight and write nothing back, so
   * the jobs keep their leases until the reaper reclaims them (EC-E1, E16). Returns the jobs dropped.
   */
  crash(): number;
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
  let crashed = false;
  let sleeping = false;
  let inFlight = 0;
  let lastWorkAt = Date.now();
  const stopController = new AbortController();
  const loops: Promise<void>[] = [];
  // Consecutive refunded queue pauses per job id; in memory, so a restart grants a fresh allowance.
  const pauseRefunds = new Map<number, number>();
  const outcomeRetryMs = opts.outcomeRetryMs ?? 250;

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

  async function runDeadHook(job: Job, error: string, jobLog: Logger): Promise<void> {
    if (!opts.onDead) return;
    try {
      await opts.onDead(job, error, opts.db);
    } catch (err) {
      jobLog.error({ err }, "onDead hook failed");
    }
  }

  async function runTick(): Promise<void> {
    try {
      const reaped = await reapStalled(opts.db);
      if (reaped.requeued > 0) log.warn({ reaped: reaped.requeued }, "returned stalled jobs to the queue");
      // A job that crashed its worker on every attempt never reaches `fail`; retire it here the same way.
      for (const job of reaped.dead) {
        const jobLog = log.child({ jobId: job.id, jobKey: job.key, jobType: job.type, importId: job.importId ?? undefined });
        jobLog.error({ attempts: job.attempts }, "job lease expired on its last attempt; marked dead");
        await runDeadHook(job, job.lastError ?? "lease expired", jobLog);
      }
      if (opts.onTick) await opts.onTick(opts.db);
    } catch (err) {
      log.error({ err }, "maintenance tick failed");
    }
  }

  /**
   * Write a job's outcome back. A database blip here (a pooled connection reset) must not take the
   * slot down: retry briefly, then give up and leave the lease to expire so the reaper requeues the job.
   */
  async function recordOutcome<T>(jobLog: Logger, what: string, write: () => Promise<T>): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write();
      } catch (err) {
        if (attempt >= OUTCOME_WRITE_ATTEMPTS || stopController.signal.aborted) {
          jobLog.error({ err, what }, "could not record the job outcome; its lease will expire and the reaper will requeue it");
          return null;
        }
        jobLog.warn({ err, what, attempt }, "recording the job outcome failed; retrying");
        await new Promise((r) => setTimeout(r, outcomeRetryMs * 2 ** (attempt - 1)));
      }
    }
  }

  async function onFailure(job: Job, err: unknown, jobLog: Logger): Promise<void> {
    const message = errorMessage(err);
    if (isJobError(err) && err.pauseQueue) {
      const pause = err.pauseQueue;
      const until = new Date(Date.now() + pause.untilMs);
      // A rate limit is always refunded: the job waits out the quota (EC-E11). An overloaded provider is
      // refunded only so often, then burns attempts so a job it keeps failing ends dead (EC-D10, D13).
      const pauses = (pauseRefunds.get(job.id) ?? 0) + 1;
      const refund = pause.limitRefunds !== true || pauses <= MAX_PAUSE_REFUNDS;
      pauseRefunds.set(job.id, pauses);
      const outcome = await recordOutcome(jobLog, "pause", async (): Promise<FailOutcome> => {
        await pauseQueue(opts.db, pause.queue, until, pause.reason);
        return fail(opts.db, job, workerId, message, refund ? { retryable: true, retryAfterMs: 0, refundAttempt: true } : { retryable: true });
      });
      jobLog.warn({ queue: pause.queue, until, reason: pause.reason, refunded: refund, consecutivePauses: pauses, outcome }, "queue paused by job");
      if (outcome !== "retry") pauseRefunds.delete(job.id);
      if (outcome === "dead") await runDeadHook(job, message, jobLog);
      return;
    }
    pauseRefunds.delete(job.id);
    const retryable = isJobError(err) ? err.retryable : true;
    const retryAfterMs = isJobError(err) ? err.retryAfterMs : undefined;
    const outcome = await recordOutcome(jobLog, "fail", () => fail(opts.db, job, workerId, message, { retryable, retryAfterMs }));
    jobLog.error({ err, outcome, attempt: job.attempts }, "job failed");
    if (outcome === "dead") await runDeadHook(job, message, jobLog);
  }

  async function execute(job: Job): Promise<void> {
    const jobLog = log.child({ jobId: job.id, jobKey: job.key, jobType: job.type, importId: job.importId ?? undefined });
    const handler = opts.handlers[job.type];
    if (!handler) {
      const msg = `no handler registered for job type "${job.type}"`;
      jobLog.error(msg);
      const outcome = await recordOutcome(jobLog, "fail", () => fail(opts.db, job, workerId, msg, { retryable: false }));
      if (outcome === "dead") await runDeadHook(job, msg, jobLog);
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
    let failure: { err: unknown } | null = null;
    try {
      await handler({ job, db: opts.db, log: jobLog, signal: leaseController.signal });
    } catch (err) {
      failure = { err };
    } finally {
      clearInterval(hb);
      stopController.signal.removeEventListener("abort", abortOnStop);
    }

    // A crashed process never gets to report; leave the lease to expire exactly as a real crash would.
    if (crashed) return;
    if (failure) {
      await onFailure(job, failure.err, jobLog);
      return;
    }
    pauseRefunds.delete(job.id);
    const ok = await recordOutcome(jobLog, "complete", () => complete(opts.db, job.id, workerId));
    if (ok) jobLog.info({ ms: Date.now() - started, attempt: job.attempts }, "job completed");
    else if (ok === false) jobLog.warn("job finished but the lease was already lost; result may be re-applied by another worker (idempotent)");
  }

  /** One claim-and-run, or one idle wait. Returns the next idle delay. */
  async function step(queue: QueueName, slot: number, slotLog: Logger, delay: number): Promise<number> {
    let job: Job | null = null;
    try {
      job = await claim(opts.db, queue, workerId, lockSeconds);
    } catch (err) {
      slotLog.error({ err }, "claim failed; backing off");
      await waitForWake(idle.maxMs);
      return delay;
    }
    if (job) {
      lastWorkAt = Date.now();
      sleeping = false;
      inFlight += 1;
      try {
        await execute(job);
      } finally {
        inFlight -= 1;
      }
      return idle.minMs;
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
      return delay;
    }
    await waitForWake(delay);
    return Math.min(delay * 2, idle.maxMs);
  }

  /** A slot must never exit while the worker runs: anything unexpected is logged and backed off (EC-E4). */
  async function loop(queue: QueueName, slot: number): Promise<void> {
    const slotLog = log.child({ queue, slot });
    let delay = idle.minMs;
    let errorBackoff = idle.minMs;
    while (!stopping) {
      try {
        delay = await step(queue, slot, slotLog, delay);
        errorBackoff = idle.minMs;
      } catch (err) {
        slotLog.error({ err }, "worker slot error; backing off and continuing");
        await waitForWake(errorBackoff);
        errorBackoff = Math.min(errorBackoff * 2, idle.maxMs);
      }
    }
  }

  for (const q of opts.queues) {
    for (let i = 0; i < q.concurrency; i++) {
      loops.push(loop(q.name, i).catch((err: unknown) => log.fatal({ err, queue: q.name, slot: i }, "worker slot exited unexpectedly")));
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
    crash(): number {
      if (stopping) return 0;
      const dropped = inFlight;
      crashed = true;
      stopping = true;
      clearInterval(ticker);
      bus.off("queue:wake", wake);
      log.error({ dropped }, "simulated crash: aborting handlers and abandoning their leases");
      stopController.abort();
      wake();
      return dropped;
    },
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
