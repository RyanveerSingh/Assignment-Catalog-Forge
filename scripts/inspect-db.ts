import "../src/lib/env";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";

/** Dev helper: dump the state of the latest imports (used while debugging the pipeline). */
async function main(): Promise<void> {
  const db = getDb();
  const show = async (label: string, q: ReturnType<typeof sql>): Promise<void> => {
    console.log(`\n== ${label}`);
    for (const r of (await db.execute(q)).rows) console.log(JSON.stringify(r));
  };
  await show("imports", sql`select id, name, status, mode, counts, product_count from imports order by created_at desc limit 6`);
  await show("products (latest 2 imports)", sql`select product_key, status, ai_batch_key, ai_tier, last_import_id from products where last_import_id in (select id from imports order by created_at desc limit 2) order by product_key`);
  await show("jobs", sql`select key, type, status, import_id, attempts, last_error from jobs order by id desc limit 15`);
  await show("ai_requests", sql`select import_id, purpose, status, batch_id, custom_id, cost_micros from ai_requests order by created_at desc limit 10`);
  await show("events (latest import)", sql`select level, message from import_events where import_id = (select id from imports order by created_at desc limit 1) order by id`);
  await show("review reasons", sql`select product_key, status, review_reasons, confidence, draft->>'category' as category, draft->>'title' as title from products order by updated_at desc limit 8`);
  await closeDb();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
