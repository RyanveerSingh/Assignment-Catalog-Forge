import "../src/lib/env";
process.env.LOG_LEVEL ??= "warn";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { attachImportFile, createImport, getImportById, updateImport } from "../src/db/repositories/imports";
import { stores } from "../src/db/schema";
import { requestDrive } from "../src/jobs/drive";
import { buildHandlers, onJobDead, onWorkerTick, QUEUE_LAYOUT } from "../src/jobs/registry";
import { getConfig } from "../src/lib/config";
import { sha256Hex } from "../src/lib/crypto";
import { seedDemo } from "../src/lib/seed";
import { getStorage } from "../src/providers/storage";
import { startWorker } from "../src/worker/loop";

/**
 * Run a sample import end to end with an in-process worker and print throughput and cost.
 *
 *   npx tsx scripts/run-import.ts --file samples/bulk-1000.csv [--photos samples/photos-messy.zip] [--store demo] [--mode fast|economy] [--ai-concurrency 4]
 *
 * Uses whatever AI_PROVIDER / ANTHROPIC_API_KEY the environment provides (mock by default).
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const file = arg("file", "samples/tiny-10.csv");
  const photosFile = arg("photos", "");
  const slug = arg("store", "demo");
  const mode = arg("mode", "fast") === "economy" ? "economy" : "fast";
  const aiConcurrency = Number(arg("ai-concurrency", String(getConfig().AI_CONCURRENCY)));
  await runMigrations();
  const db = getDb();
  await seedDemo(db);
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
  if (!store) throw new Error(`store ${slug} not found`);

  const buffer = readFileSync(path.resolve(file));
  const imp = await createImport(db, { storeId: store.id, name: path.basename(file), mode, budgetCents: 2_000 });
  const blob = await getStorage().put(store.id, buffer, file.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
  await attachImportFile(db, { importId: imp.id, storeId: store.id, kind: "sheet", blobId: blob.id, sha256: blob.sha256, size: blob.size, mime: "text/csv", originalName: path.basename(file) });
  if (photosFile) {
    const zip = readFileSync(path.resolve(photosFile));
    const zb = await getStorage().put(store.id, zip, "application/zip");
    await attachImportFile(db, { importId: imp.id, storeId: store.id, kind: "zip", blobId: zb.id, sha256: zb.sha256, size: zb.size, mime: "application/zip", originalName: path.basename(photosFile) });
  }
  await updateImport(db, imp.id, { status: "queued", fileHash: sha256Hex(buffer) });

  const handle = startWorker({
    db,
    handlers: buildHandlers(),
    queues: QUEUE_LAYOUT.map((q) => (q.name === "ai" ? { ...q, concurrency: aiConcurrency } : q)),
    onDead: onJobDead,
    onTick: onWorkerTick,
    tickMs: 5_000,
    idle: { minMs: 50, maxMs: 500 },
  });
  const started = Date.now();
  await requestDrive(db, imp.id, store.id);
  console.log(`import ${imp.id} started (${file}, mode ${mode}, provider ${process.env.AI_PROVIDER ?? "mock"})`);

  let last = "";
  for (;;) {
    const cur = await getImportById(db, imp.id);
    if (!cur) break;
    const c = cur.counts;
    const line = `${cur.status.padEnd(14)} done ${c.done} review ${c.needs_review} failed ${c.failed} pending ${c.pending} / ${cur.totalRows} products ${cur.productCount} cost $${(cur.costMicros / 1e6).toFixed(4)}${cur.pauseReason ? `  [${cur.pauseReason}]` : ""}`;
    if (line !== last) {
      console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(7)}s  ${line}`);
      last = line;
    }
    if (["completed", "needs_attention", "failed", "cancelled"].includes(cur.status)) break;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  const final = await getImportById(db, imp.id);
  const ms = Date.now() - started;
  if (final) {
    console.log("\nRESULT");
    console.log(`  status           ${final.status}`);
    console.log(`  rows             ${final.totalRows}`);
    console.log(`  products         ${final.productCount}`);
    console.log(`  duration         ${(ms / 1000).toFixed(1)} s`);
    console.log(`  rows per minute  ${Math.round((final.totalRows / ms) * 60_000)}`);
    console.log(`  cost             $${(final.costMicros / 1e6).toFixed(4)}  (saved $${((final.costSummary?.savedMicros ?? 0) / 1e6).toFixed(4)} vs strong-model baseline)`);
    console.log(`  counts           ${JSON.stringify(final.counts)}`);
  }
  await handle.stop(5_000);
  await closeDb();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await closeDb();
  process.exitCode = 1;
});
