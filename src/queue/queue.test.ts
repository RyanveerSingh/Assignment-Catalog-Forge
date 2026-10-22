import "@/lib/env";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { backoffMs, claim, complete, enqueue, fail, hasPendingWork, heartbeat, isQueuePaused, pauseQueue, queueDepth, reapStalled, resumeQueue } from "./queue";

describe("backoffMs", () => {
  it("doubles per attempt with jitter and caps at five minutes", () => {
    const fixed = () => 0.5; // zero jitter
    expect(backoffMs(1, fixed)).toBe(2_000);
    expect(backoffMs(2, fixed)).toBe(4_000);
    expect(backoffMs(3, fixed)).toBe(8_000);
    expect(backoffMs(20, fixed)).toBe(300_000);
    const low = backoffMs(2, () => 0);
    const high = backoffMs(2, () => 1);
    expect(low).toBe(3_000);
    expect(high).toBe(5_000);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("queue (integration)", () => {
  let db: Db;

  beforeAll(async () => {
    process.env.APP_SECRET ??= "test-secret-at-least-16-chars";
    await runMigrations();
    db = getDb();
  });

  beforeEach(async () => {
    await db.execute(sql`delete from jobs`);
    await db.execute(sql`delete from queue_state`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("EC-E1: enqueueing the same key twice is a no-op while the job is queued or running", async () => {
    const first = await enqueue(db, { key: "import:x:clean:0", type: "rows.clean" });
    const second = await enqueue(db, { key: "import:x:clean:0", type: "rows.clean" });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    const depth = await queueDepth(db);
    expect(depth.default.queued).toBe(1);

    const job = await claim(db, "default", "w1");
    expect(job?.key).toBe("import:x:clean:0");
    const third = await enqueue(db, { key: "import:x:clean:0", type: "rows.clean" });
    expect(third.inserted).toBe(false);
  });

  it("revives a completed job with the same key (Retry button) and resets attempts", async () => {
    await enqueue(db, { key: "k", type: "t" });
    const job = await claim(db, "default", "w1");
    expect(job).not.toBeNull();
    expect(await complete(db, job!.id, "w1")).toBe(true);
    const revived = await enqueue(db, { key: "k", type: "t" });
    expect(revived.inserted).toBe(true);
    const again = await claim(db, "default", "w1");
    expect(again?.attempts).toBe(1);
  });

  it("hands each job to exactly one of many concurrent claimers", async () => {
    for (let i = 0; i < 20; i++) await enqueue(db, { key: `j${i}`, type: "t" });
    const claimed = await Promise.all(
      Array.from({ length: 40 }, (_, i) => claim(db, "default", `w${i}`)),
    );
    const keys = claimed.filter((j): j is NonNullable<typeof j> => j !== null).map((j) => j.key);
    expect(keys).toHaveLength(20);
    expect(new Set(keys).size).toBe(20);
  });

  it("orders by priority then run_at and skips jobs scheduled in the future", async () => {
    await enqueue(db, { key: "later", type: "t", priority: 10, runAt: new Date(Date.now() + 60_000) });
    await enqueue(db, { key: "low", type: "t", priority: 100 });
    await enqueue(db, { key: "high", type: "t", priority: 50 });
    expect((await claim(db, "default", "w"))?.key).toBe("high");
    expect((await claim(db, "default", "w"))?.key).toBe("low");
    expect(await claim(db, "default", "w")).toBeNull();
  });

  it("EC-E10: a job whose lease expired is returned to the queue by the reaper", async () => {
    await enqueue(db, { key: "stalled", type: "t" });
    const job = await claim(db, "default", "dead-worker", 1);
    expect(job).not.toBeNull();
    expect(await reapStalled(db)).toBe(0); // lease still valid
    await new Promise((r) => setTimeout(r, 1_200));
    expect(await reapStalled(db)).toBe(1);
    const again = await claim(db, "default", "w2");
    expect(again?.key).toBe("stalled");
    expect(again?.attempts).toBe(2);
    expect(again?.lastError).toMatch(/lease expired/);
  });

  it("heartbeat extends the lease and fails once the job is no longer ours", async () => {
    await enqueue(db, { key: "hb", type: "t" });
    const job = await claim(db, "default", "w1", 1);
    expect(await heartbeat(db, job!.id, "w1", 60)).toBe(true);
    await new Promise((r) => setTimeout(r, 1_200));
    expect(await reapStalled(db)).toBe(0); // heartbeat extended it
    expect(await heartbeat(db, job!.id, "someone-else", 60)).toBe(false);
  });

  it("EC-D8/D10: failures retry with backoff until max attempts, then the job is dead", async () => {
    await enqueue(db, { key: "flaky", type: "t", maxAttempts: 2 });
    const j1 = await claim(db, "default", "w");
    expect(await fail(db, j1!, "w", "boom", { retryable: true, retryAfterMs: 0 })).toBe("retry");
    const j2 = await claim(db, "default", "w");
    expect(j2?.attempts).toBe(2);
    expect(await fail(db, j2!, "w", "boom again", { retryable: true, retryAfterMs: 0 })).toBe("dead");
    expect(await claim(db, "default", "w")).toBeNull();
    const depth = await queueDepth(db);
    expect(depth.default.dead).toBe(1);
  });

  it("EC-D11: a non-retryable failure is dead immediately", async () => {
    await enqueue(db, { key: "bad", type: "t" });
    const j = await claim(db, "default", "w");
    expect(await fail(db, j!, "w", "400 bad request", { retryable: false })).toBe("dead");
  });

  it("EC-D9: a paused queue hands out nothing until the pause expires, and refunding keeps the attempt count", async () => {
    await enqueue(db, { key: "ai-1", type: "products.enrich", queue: "ai" });
    const j = await claim(db, "ai", "w");
    expect(j).not.toBeNull();
    await pauseQueue(db, "ai", new Date(Date.now() + 60_000), "rate limited");
    expect(await fail(db, j!, "w", "429", { retryable: true, retryAfterMs: 0, refundAttempt: true })).toBe("retry");
    expect(await claim(db, "ai", "w")).toBeNull();
    const state = await isQueuePaused(db, "ai");
    expect(state.paused).toBe(true);
    expect(state.reason).toBe("rate limited");
    await resumeQueue(db, "ai");
    const again = await claim(db, "ai", "w");
    expect(again?.key).toBe("ai-1");
    expect(again?.attempts).toBe(1); // refunded
  });

  it("EC-E18: hasPendingWork is false when nothing is queued or running", async () => {
    expect(await hasPendingWork(db)).toBe(false);
    await enqueue(db, { key: "p", type: "t", runAt: new Date(Date.now() + 60_000) });
    expect(await hasPendingWork(db)).toBe(true);
  });
});
