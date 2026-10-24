import "@/lib/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { attachImportFile, createImport, getImportById, updateImport } from "@/db/repositories/imports";
import { aiRequests, importRows, jobs, products, storefrontProducts, translations, variants } from "@/db/schema";
import { createStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { getLogger } from "@/lib/logger";
import { getStorage } from "@/providers/storage";
import { claim, reapStalled } from "@/queue/queue";
import { startWorker, type WorkerHandle } from "@/worker/loop";
import { requestDrive } from "./drive";
import { JOB_TYPES } from "./keys";
import { publishProduct } from "./publish";
import { buildHandlers, onJobDead, onWorkerTick } from "./registry";

/**
 * End-to-end: a real sheet goes through ingest → clean → group → enrich (mock provider) → translate →
 * finalize on the real queue and worker loop. Then the same file again (no duplicates, no AI calls),
 * and a worker restart mid-import (nothing lost, nothing doubled).
 */
describe.skipIf(!process.env.DATABASE_URL)("import pipeline (integration)", () => {
  let db: Db;
  let storeId: string;
  let handle: WorkerHandle | null = null;
  const sample = readFileSync(path.join(process.cwd(), "samples", "tiny-10.csv"));

  async function startPipelineWorker(): Promise<WorkerHandle> {
    return startWorker({
      db,
      handlers: buildHandlers(),
      queues: [
        { name: "default", concurrency: 2 },
        { name: "ai", concurrency: 2 },
        { name: "translate", concurrency: 2 },
      ],
      onDead: onJobDead,
      onTick: onWorkerTick,
      tickMs: 1_000,
      idle: { minMs: 20, maxMs: 200, sleepAfterMs: 60_000 },
    });
  }

  async function createImportFor(buffer: Buffer, name: string, mode: "fast" | "economy" = "fast"): Promise<string> {
    const imp = await createImport(db, { storeId, name, mode });
    const blob = await getStorage().put(storeId, buffer, "text/csv");
    await attachImportFile(db, { importId: imp.id, storeId, kind: "sheet", blobId: blob.id, sha256: blob.sha256, size: blob.size, mime: "text/csv", originalName: name });
    await updateImport(db, imp.id, { status: "queued", fileHash: sha256Hex(buffer) });
    await requestDrive(db, imp.id, storeId);
    return imp.id;
  }

  async function waitForTerminal(importId: string, timeoutMs = 60_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const imp = await getImportById(db, importId);
      if (imp && ["completed", "needs_attention", "failed"].includes(imp.status)) return imp.status;
      await new Promise((r) => setTimeout(r, 100));
    }
    const imp = await getImportById(db, importId);
    throw new Error(`timed out; status ${imp?.status}, counts ${JSON.stringify(imp?.counts)}`);
  }

  beforeAll(async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.STORAGE_DRIVER = "pg";
    process.env.WORKER_MODE = "separate";
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    await db.execute(sql`delete from jobs`);
    await db.execute(sql`delete from queue_state`);
    const user = await registerUser(db, { email: `pipeline-${Date.now()}@test.local`, password: "pw12345678", name: "Pipeline Test" });
    const store = await createStore(db, user.id, { name: "Pipeline Test Store", slug: `pipeline-${Date.now()}` });
    storeId = store.id;
  });

  afterAll(async () => {
    if (handle) await handle.stop(2_000);
    await closeDb();
  });

  it("runs tiny-10.csv end to end with every row in a terminal state and products translated", async () => {
    handle = await startPipelineWorker();
    const importId = await createImportFor(sample, "tiny-10.csv");
    const status = await waitForTerminal(importId);
    const imp = (await getImportById(db, importId))!;
    expect(status, imp.error ?? "").toBe("completed");
    expect(imp.totalRows).toBe(10);
    // EC-E9: counts add up to the sheet.
    expect(imp.counts.done + imp.counts.needs_review + imp.counts.failed).toBe(10);
    expect(imp.counts.pending).toBe(0);
    expect(imp.counts.processing).toBe(0);

    const prods = await db.select().from(products).where(eq(products.lastImportId, importId));
    expect(prods.length).toBe(4);
    for (const p of prods) {
      expect(["draft", "needs_review"]).toContain(p.status);
      expect(p.draft?.title).toBeTruthy();
      expect(p.draft?.category).toContain(">");
      expect(p.translatedAt).not.toBeNull();
    }
    const vars = await db.select().from(variants).where(eq(variants.storeId, storeId));
    expect(vars.length).toBe(10);
    expect(vars.every((v) => v.priceCents === null || Number.isInteger(v.priceCents))).toBe(true);
    const de = await db.select().from(translations).where(and(eq(translations.storeId, storeId), eq(translations.locale, "de"), eq(translations.field, "title")));
    expect(de.length).toBe(4);
    expect(de.every((t) => t.status === "fresh" && t.text)).toBe(true);
    const calls = await db.select({ n: sql<number>`count(*)::int` }).from(aiRequests).where(eq(aiRequests.importId, importId));
    expect(calls[0]!.n).toBeGreaterThan(0);
  });

  it("EC-E7/C10/D20: re-uploading the same file creates no duplicates and makes no AI calls", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.storeId, storeId));
    const importId = await createImportFor(sample, "tiny-10.csv");
    const status = await waitForTerminal(importId);
    expect(status).toBe("completed");
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.storeId, storeId));
    expect(after[0]!.n).toBe(before[0]!.n);
    const vars = await db.select({ n: sql<number>`count(*)::int` }).from(variants).where(eq(variants.storeId, storeId));
    expect(vars[0]!.n).toBe(10);
    const calls = await db.select({ n: sql<number>`count(*)::int` }).from(aiRequests).where(and(eq(aiRequests.importId, importId), eq(aiRequests.purpose, "enrich")));
    expect(calls[0]!.n).toBe(0);
    const imp = (await getImportById(db, importId))!;
    expect(imp.counts.done + imp.counts.needs_review).toBe(10);
  });

  it("EC-E1: a worker killed mid-import resumes after restart with nothing lost or doubled", async () => {
    // Change one cell so the content is new and the AI stage must run again.
    const changed = Buffer.from(sample.toString("utf8").replaceAll("Terracotta", "Terracotta Classic"), "utf8");
    const importId = await createImportFor(changed, "tiny-10-v2.csv");
    // Let the first stage start, then kill the worker abruptly (in-flight jobs are abandoned).
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const imp = await getImportById(db, importId);
      if (imp && imp.status !== "queued" && imp.status !== "parsing") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await handle!.stop(0);
    handle = null;
    // Simulate a crash: any lease the old worker held will expire and be reaped by the new one.
    await db.execute(sql`update jobs set locked_until = now() - interval '1 minute' where status = 'running'`);
    handle = await startPipelineWorker();
    const status = await waitForTerminal(importId, 90_000);
    expect(status).toBe("completed");
    const imp = (await getImportById(db, importId))!;
    expect(imp.counts.done + imp.counts.needs_review + imp.counts.failed).toBe(10);
    // The content changed, so the AI stage must have run again for this import.
    const calls = await db.select({ n: sql<number>`count(*)::int` }).from(aiRequests).where(and(eq(aiRequests.importId, importId), eq(aiRequests.purpose, "enrich"), eq(aiRequests.status, "succeeded")));
    expect(calls[0]!.n).toBeGreaterThan(0);
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(importRows).where(eq(importRows.importId, importId));
    expect(rows[0]!.n).toBe(10);
    const prods = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.storeId, storeId));
    expect(prods[0]!.n).toBe(4);
  });

  it("EC-D14: economy mode runs through the batch API path and lands every row", { timeout: 90_000 }, async () => {
    const changed = Buffer.from(sample.toString("utf8").replaceAll("drainage hole", "drainage hole and saucer"), "utf8");
    const importId = await createImportFor(changed, "tiny-10-economy.csv", "economy");
    const status = await waitForTerminal(importId, 80_000);
    const imp = (await getImportById(db, importId))!;
    expect(status, imp.error ?? "").toBe("completed");
    expect(imp.counts.done + imp.counts.needs_review + imp.counts.failed).toBe(10);
    const batched = await db.select({ n: sql<number>`count(*)::int` }).from(aiRequests).where(and(eq(aiRequests.importId, importId), sql`${aiRequests.batchId} is not null`, eq(aiRequests.status, "succeeded")));
    expect(batched[0]!.n).toBeGreaterThan(0);
  });

  it("EC-H1/H2: approving publishes storefront rows per locale with English fallbacks where needed", async () => {
    const [p] = await db.select().from(products).where(eq(products.storeId, storeId)).limit(1);
    expect(p).toBeTruthy();
    expect(await publishProduct(db, p!.storeId, p!.id)).toBe(true);
    const rows = await db.select().from(storefrontProducts).where(eq(storefrontProducts.productId, p!.id));
    expect(rows.map((r) => r.locale).sort()).toEqual(["de", "en", "fr"]);
    const deRow = rows.find((r) => r.locale === "de")!;
    expect(deRow.title.length).toBeGreaterThan(0);
    expect(Array.isArray(deRow.fallbackFields)).toBe(true);
    const enRow = rows.find((r) => r.locale === "en")!;
    expect(enRow.fallbackFields).toEqual([]);
  });

  it("EC-E1/E2/E10: an enrich job abandoned by a crashed worker after its model call is re-run exactly once, with no second call and no double charge", { timeout: 120_000 }, async () => {
    if (handle) await handle.stop(2_000);
    handle = null;
    // Only the default queue runs, so the import parks at enriching with its AI jobs queued.
    const parked = startWorker({ db, handlers: buildHandlers(), queues: [{ name: "default", concurrency: 2 }], onDead: onJobDead, onTick: onWorkerTick, tickMs: 1_000, idle: { minMs: 20, maxMs: 200, sleepAfterMs: 60_000 } });
    const changed = Buffer.from(sample.toString("utf8").replaceAll("porous clay", `porous clay (batch ${Date.now()})`), "utf8");
    const importId = await createImportFor(changed, "tiny-10-crash.csv");
    const deadline = Date.now() + 30_000;
    let queuedEnrich = 0;
    while (Date.now() < deadline && queuedEnrich === 0) {
      queuedEnrich = (await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.importId, importId), eq(jobs.type, JOB_TYPES.enrich), eq(jobs.status, "queued")))).length;
      if (queuedEnrich === 0) await new Promise((r) => setTimeout(r, 50));
    }
    await parked.stop(2_000);
    expect(queuedEnrich).toBeGreaterThan(0);

    // A real crash, not a graceful stop: the doomed worker claims a job, does all of its work (the
    // model is called and the answer stored and applied), then dies without complete() or fail().
    const job = await claim(db, "ai", "doomed-worker", 60);
    expect(job?.importId).toBe(importId);
    await buildHandlers()[JOB_TYPES.enrich]!({ job: job!, db, log: getLogger({ test: "crash" }), signal: new AbortController().signal });
    const callsBefore = await db.select().from(aiRequests).where(and(eq(aiRequests.importId, importId), eq(aiRequests.customId, job!.key)));
    expect(callsBefore.filter((c) => c.status === "succeeded")).toHaveLength(1);

    // Its lease expires and the reaper hands the job back.
    await db.execute(sql`update jobs set locked_until = now() - interval '1 second' where id = ${job!.id}`);
    const reaped = await reapStalled(db);
    expect(reaped.requeued).toBe(1);
    expect(reaped.dead).toEqual([]);

    // A fresh worker finishes the import; count how often the abandoned job runs again.
    let reruns = 0;
    const counted = buildHandlers();
    const enrich = counted[JOB_TYPES.enrich]!;
    counted[JOB_TYPES.enrich] = async (ctx) => {
      if (ctx.job.key === job!.key) reruns += 1;
      return enrich(ctx);
    };
    handle = startWorker({ db, handlers: counted, queues: [{ name: "default", concurrency: 2 }, { name: "ai", concurrency: 2 }, { name: "translate", concurrency: 2 }], onDead: onJobDead, onTick: onWorkerTick, tickMs: 1_000, idle: { minMs: 20, maxMs: 200, sleepAfterMs: 60_000 } });
    const status = await waitForTerminal(importId, 90_000);
    expect(status).toBe("completed");
    expect(reruns).toBe(1);
    const [after] = await db.select().from(jobs).where(eq(jobs.id, job!.id));
    expect(after?.status).toBe("completed");
    expect(after?.attempts).toBe(2);

    // No second model call for that batch, no request billed twice, and the import's cost is the sum of its calls.
    const callsAfter = await db.select().from(aiRequests).where(and(eq(aiRequests.importId, importId), eq(aiRequests.customId, job!.key)));
    expect(callsAfter.map((c) => c.id).sort()).toEqual(callsBefore.map((c) => c.id).sort());
    const doubled = await db.execute(sql`
      select request_hash from ai_requests where import_id = ${importId} and status = 'succeeded' and cost_micros > 0
       group by request_hash having count(*) > 1`);
    expect(doubled.rows).toHaveLength(0);
    const total = await db.execute<{ s: string }>(sql`select coalesce(sum(cost_micros), 0)::text as s from ai_requests where import_id = ${importId}`);
    expect((await getImportById(db, importId))?.costMicros).toBe(Number(total.rows[0]?.s));
    const imp = (await getImportById(db, importId))!;
    expect(imp.counts.done + imp.counts.needs_review + imp.counts.failed).toBe(10);
  });
});
