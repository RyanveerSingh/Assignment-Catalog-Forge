import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { JobError } from "@/queue/errors";
import * as queue from "@/queue/queue";
import type { Job } from "@/queue/queue";
import { MAX_PAUSE_REFUNDS, startWorker, type WorkerHandle, type WorkerOptions } from "./loop";

// Every database call the loop makes is faked, so these run without Postgres and can make a write
// fail on demand (a pooled Neon connection being reset mid-write).
vi.mock("@/queue/queue", () => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  heartbeat: vi.fn(),
  pauseQueue: vi.fn(),
  reapStalled: vi.fn(),
  hasPendingWork: vi.fn(),
}));

const db = {} as unknown as Db;

function makeJob(id: number, overrides: Partial<Job> = {}): Job {
  const now = new Date();
  return {
    id,
    key: `job-${id}`,
    queue: "default",
    type: "test.work",
    payload: {},
    status: "running",
    priority: 100,
    runAt: now,
    attempts: 1,
    maxAttempts: 5,
    lockedUntil: now,
    workerId: "w",
    lastError: null,
    storeId: null,
    importId: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function waitFor(pred: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting for condition");
}

const connectionReset = (): Error => new Error("Connection terminated unexpectedly");

describe("worker loop resilience (database faked)", () => {
  let handle: WorkerHandle | null = null;
  let pending: Job[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    pending = [];
    vi.mocked(queue.claim).mockImplementation(async () => pending.shift() ?? null);
    vi.mocked(queue.complete).mockResolvedValue(true);
    vi.mocked(queue.fail).mockResolvedValue("retry");
    vi.mocked(queue.heartbeat).mockResolvedValue(true);
    vi.mocked(queue.pauseQueue).mockResolvedValue(undefined);
    vi.mocked(queue.reapStalled).mockResolvedValue({ requeued: 0, dead: [] });
    vi.mocked(queue.hasPendingWork).mockResolvedValue(true);
  });

  afterEach(async () => {
    if (handle) await handle.stop(1_000);
    handle = null;
  });

  function start(handlers: WorkerOptions["handlers"], extra: Partial<WorkerOptions> = {}): WorkerHandle {
    handle = startWorker({ db, handlers, queues: [{ name: "default", concurrency: 1 }], idle: { minMs: 5, maxMs: 20 }, outcomeRetryMs: 1, ...extra });
    return handle;
  }

  const failRefunds = (): boolean[] => vi.mocked(queue.fail).mock.calls.map((call) => call[4].refundAttempt === true);

  it("EC-E4: a complete() that keeps throwing does not kill the slot; it keeps claiming", async () => {
    const ran: string[] = [];
    vi.mocked(queue.complete).mockImplementation(async (_db, jobId) => {
      if (jobId === 1) throw connectionReset();
      return true;
    });
    pending = [makeJob(1), makeJob(2)];
    start({ "test.work": async ({ job }) => void ran.push(job.key) });
    await waitFor(() => vi.mocked(queue.complete).mock.calls.some(([, id]) => id === 2));
    // Three tries for job 1, after which its lease is left for the reaper; then job 2 runs normally.
    expect(vi.mocked(queue.complete).mock.calls.filter(([, id]) => id === 1)).toHaveLength(3);
    expect(ran).toEqual(["job-1", "job-2"]);
    expect(handle?.inFlight()).toBe(0);
  });

  it("EC-E4: a fail() that throws does not kill the slot, and the next job still runs", async () => {
    const ran: string[] = [];
    vi.mocked(queue.fail).mockRejectedValue(connectionReset());
    pending = [makeJob(1, { type: "test.boom" }), makeJob(2)];
    start({
      "test.boom": async () => {
        throw new Error("handler failed");
      },
      "test.work": async ({ job }) => void ran.push(job.key),
    });
    await waitFor(() => ran.includes("job-2"));
    expect(vi.mocked(queue.fail)).toHaveBeenCalledTimes(3);
  });

  it("EC-E4: a pauseQueue() that throws does not kill the slot", async () => {
    const ran: string[] = [];
    vi.mocked(queue.pauseQueue).mockRejectedValue(connectionReset());
    pending = [makeJob(1, { type: "test.limited" }), makeJob(2)];
    start({
      "test.limited": async () => {
        throw new JobError("429", { pauseQueue: { queue: "default", untilMs: 1, reason: "rate limited" } });
      },
      "test.work": async ({ job }) => void ran.push(job.key),
    });
    await waitFor(() => ran.includes("job-2"));
  });

  it("EC-E4: a claim that throws keeps the slot alive, and it recovers when the database is back", async () => {
    const ran: string[] = [];
    let calls = 0;
    vi.mocked(queue.claim).mockImplementation(async () => {
      calls += 1;
      if (calls <= 2) throw connectionReset();
      return pending.shift() ?? null;
    });
    pending = [makeJob(1)];
    start({ "test.work": async ({ job }) => void ran.push(job.key) }, { idle: { minMs: 5, maxMs: 10 } });
    await waitFor(() => ran.length === 1);
  });

  it("EC-E4: an onDead hook that throws does not kill the slot", async () => {
    const ran: string[] = [];
    vi.mocked(queue.fail).mockResolvedValue("dead");
    pending = [makeJob(1, { type: "test.boom" }), makeJob(2)];
    start(
      {
        "test.boom": async () => {
          throw new JobError("bad input", { retryable: false });
        },
        "test.work": async ({ job }) => void ran.push(job.key),
      },
      {
        onDead: async () => {
          throw connectionReset();
        },
      },
    );
    await waitFor(() => ran.includes("job-2"));
  });

  it("EC-D10: refunds stop after MAX_PAUSE_REFUNDS consecutive pauses, so the job burns attempts instead of looping", async () => {
    const total = MAX_PAUSE_REFUNDS + 2;
    for (let i = 0; i < total; i++) pending.push(makeJob(7, { type: "test.overloaded" }));
    start({
      "test.overloaded": async () => {
        throw new JobError("529 overloaded", { pauseQueue: { queue: "default", untilMs: 1, reason: "AI provider overloaded", limitRefunds: true } });
      },
    });
    await waitFor(() => vi.mocked(queue.fail).mock.calls.length === total);
    expect(failRefunds()).toEqual([...Array<boolean>(MAX_PAUSE_REFUNDS).fill(true), false, false]);
    expect(vi.mocked(queue.pauseQueue)).toHaveBeenCalledTimes(total);
  });

  it("EC-E11: a rate-limit pause is always refunded, however often it repeats", async () => {
    const total = MAX_PAUSE_REFUNDS + 3;
    for (let i = 0; i < total; i++) pending.push(makeJob(8, { type: "test.ratelimited" }));
    start({
      "test.ratelimited": async () => {
        throw new JobError("429", { pauseQueue: { queue: "default", untilMs: 1, reason: "Rate limited by the AI provider" } });
      },
    });
    await waitFor(() => vi.mocked(queue.fail).mock.calls.length === total);
    expect(failRefunds().every(Boolean)).toBe(true);
  });

  it("EC-D10: a successful run resets the refund allowance", async () => {
    let calls = 0;
    for (let i = 0; i < MAX_PAUSE_REFUNDS + 2; i++) pending.push(makeJob(5, { type: "test.flaky" }));
    start({
      "test.flaky": async () => {
        calls += 1;
        if (calls === 3) return; // one success in the middle
        throw new JobError("529", { pauseQueue: { queue: "default", untilMs: 1, reason: "overloaded", limitRefunds: true } });
      },
    });
    await waitFor(() => vi.mocked(queue.fail).mock.calls.length === MAX_PAUSE_REFUNDS + 1);
    expect(failRefunds().every(Boolean)).toBe(true);
  });

  it("EC-D10: a job that runs out of attempts while pausing goes to the onDead hook", async () => {
    const dead: string[] = [];
    vi.mocked(queue.fail).mockImplementation(async (_db, _job, _w, _e, opts) => (opts.refundAttempt ? "retry" : "dead"));
    for (let i = 0; i <= MAX_PAUSE_REFUNDS; i++) pending.push(makeJob(8, { type: "test.overloaded" }));
    start(
      {
        "test.overloaded": async () => {
          throw new JobError("529 overloaded", { pauseQueue: { queue: "default", untilMs: 1, reason: "overloaded", limitRefunds: true } });
        },
      },
      { onDead: async (job) => void dead.push(job.key) },
    );
    await waitFor(() => dead.length === 1);
    expect(dead).toEqual(["job-8"]);
  });

  it("EC-E10: a job the reaper retires as dead (lease expired on its last attempt) runs the onDead hook", async () => {
    const dead: string[] = [];
    const retired = makeJob(9, { status: "dead", attempts: 5, maxAttempts: 5, lastError: "lease expired on the last attempt" });
    vi.mocked(queue.reapStalled).mockResolvedValueOnce({ requeued: 0, dead: [retired] });
    start({}, { onDead: async (job, error) => void dead.push(`${job.key}:${error}`) });
    await waitFor(() => dead.length === 1);
    expect(dead).toEqual(["job-9:lease expired on the last attempt"]);
  });
});
