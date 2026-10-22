import "@/lib/env";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client";
import { getLogger } from "@/lib/logger";

/** Arbitrary constant; every process that migrates takes the same advisory lock. */
const MIGRATION_LOCK_KEY = 7_311_942;

/**
 * Apply pending migrations under a Postgres advisory lock so two processes booting at the same
 * time (web + worker, or two replicas) never race on the schema (EC-J2).
 */
export async function runMigrations(migrationsFolder = "drizzle"): Promise<void> {
  const db = getDb();
  const log = getLogger({ component: "migrate" });
  await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
  try {
    await migrate(db, { migrationsFolder });
    log.info("migrations applied");
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runMigrations()
    .then(() => closeDb())
    .catch(async (err: unknown) => {
      getLogger({ component: "migrate" }).error({ err }, "migration failed");
      await closeDb();
      process.exitCode = 1;
    });
}
