import "@/lib/env";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { JobError } from "@/queue/errors";
import { enqueue, isQueuePaused, queueDepth } from "@/queue/queue";
import { startWorker, type WorkerHandle } from "./loop";

async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out waiting for condition");
}

describe.skipIf(!process.env.DATABASE_URL)("worker loop (integration)", () => {
  let db: Db;
  let handle: WorkerHandle | null = null;

  beforeAll(async () => {
    await runMigrations();
    db = getDb();
  });

  beforeEach(async () => {
    await db.execute(sql`delete from jobs`);
    await db.execute(sql`delete from queue_state`);
  });

  afterAll(async () => {
    if (handle) await handle.stop(2_000);
    await closeDb();
  });

  it("runs every enqueued job exactly once across concurrent slots", async () => {
    const seen: string[] = [];
    handle = startWorker({
      db,
      queues: [{ name: "default", concurrency: 3 }],
      handlers: {
        "test.record": async ({ job }) => {
          seen.push(job.key);
          await new Promise((r) => setTimeout(r, 20));
        },
      },
      idle: { minMs: 20, maxMs: 100 },
    });
    for (let i = 0; i < 12; i++) await enqueue(db, { key: `rec-${i}`, type: "test.record" });
    handle.wake();
    await waitFor(() => seen.length === 12);
    await handle.stop(2_000);
    handle = null;
    expect(new Set(seen).size).toBe(12);
    const depth = await queueDepth(db);
    expect(depth.default.queued).toBe(0);
    expect(depth.default.running).toBe(0);
  });

  it("EC-D9: a JobError with pauseQueue pauses the queue, refunds the attempt and re-queues the job", async () => {
    let calls = 0;
    handle = startWorker({
      db,
      queues: [{ name: "ai", concurrency: 1 }],
      handlers: {
        "test.ratelimited": async () => {
          calls += 1;
          throw new JobError("429 from provider", {
            pauseQueue: { queue: "ai", untilMs: 60_000, reason: "Rate limited by the AI provider" },
          });
        },
      },
      idle: { minMs: 20, maxMs: 100 },
    });
    await enqueue(db, { key: "rl", type: "test.ratelimited", queue: "ai" });
    handle.wake();
    await waitFor(async () => (await isQueuePaused(db, "ai")).paused);
    await handle.stop(2_000);
    handle = null;
    expect(calls).toBe(1);
    const [row] = (await db.execute<{ status: string; attempts: number }>(sql`select status, attempts from jobs where key = 'rl'`)).rows;
    expect(row?.status).toBe("queued");
    expect(Number(row?.attempts)).toBe(0);
  });

  it("calls onDead once a job exhausts its attempts", async () => {
    const dead: string[] = [];
    handle = startWorker({
      db,
      queues: [{ name: "default", concurrency: 1 }],
      handlers: {
        "test.fail": async () => {
          throw new JobError("always fails", { retryAfterMs: 0 });
        },
      },
      onDead: async (job) => {
        dead.push(job.key);
      },
      idle: { minMs: 20, maxMs: 100 },
    });
    await enqueue(db, { key: "doomed", type: "test.fail", maxAttempts: 2 });
    handle.wake();
    await waitFor(() => dead.length === 1);
    await handle.stop(2_000);
    handle = null;
    expect(dead).toEqual(["doomed"]);
  });

  it("marks unknown job types dead without retrying", async () => {
    const dead: string[] = [];
    handle = startWorker({
      db,
      queues: [{ name: "default", concurrency: 1 }],
      handlers: {},
      onDead: async (job) => {
        dead.push(job.key);
      },
      idle: { minMs: 20, maxMs: 100 },
    });
    await enqueue(db, { key: "mystery", type: "nope" });
    handle.wake();
    await waitFor(() => dead.length === 1);
    await handle.stop(2_000);
    handle = null;
    const depth = await queueDepth(db);
    expect(depth.default.dead).toBe(1);
  });
});
