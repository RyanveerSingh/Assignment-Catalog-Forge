import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either a database handle or a transaction handle; repositories accept both. */
export type DbOrTx = Db | DbTx;

let mainPool: Pool | null = null;
let storefrontPool: Pool | null = null;
let mainDb: Db | null = null;
let storefrontDb: Db | null = null;

/**
 * A transaction-mode pooler (PgBouncer, Neon's "-pooler" host) refuses startup options, so the
 * statement timeout is only sent on direct connections.
 */
function isPooler(connectionString: string): boolean {
  return /-pooler\.|pgbouncer=true/.test(connectionString);
}

function makePool(connectionString: string, max: number, statementTimeoutMs?: number): Pool {
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Sent in the startup packet, so every connection carries the timeout without a racing SET query.
    ...(statementTimeoutMs && !isPooler(connectionString) ? { options: `-c statement_timeout=${statementTimeoutMs}` } : {}),
  });
  pool.on("error", (err) => getLogger({ component: "db" }).error({ err }, "idle client error"));
  return pool;
}

/**
 * Main pool: dashboard writes, workers, migrations. Sized above the embedded worker's slot count
 * (about eleven) so polling slots can never hold every connection while a page waits, which a
 * remote database's round trips otherwise make likely.
 */
export function getPool(): Pool {
  if (!mainPool) mainPool = makePool(getConfig().DATABASE_URL, 20);
  return mainPool;
}

export function getDb(): Db {
  if (!mainDb) mainDb = drizzle(getPool(), { schema });
  return mainDb;
}

/**
 * Storefront pool: small, read-only in practice, with a hard statement timeout so a slow query
 * can never pile up behind a running import (EC-H6). Uses the pooled URL when one is configured.
 */
export function getStorefrontPool(): Pool {
  if (!storefrontPool) {
    const cfg = getConfig();
    storefrontPool = makePool(cfg.DATABASE_POOL_URL || cfg.DATABASE_URL, 4, 2_000);
  }
  return storefrontPool;
}

export function getStorefrontDb(): Db {
  if (!storefrontDb) storefrontDb = drizzle(getStorefrontPool(), { schema });
  return storefrontDb;
}

/** Close every pool. Used by the worker on shutdown and by tests. */
export async function closeDb(): Promise<void> {
  const pools = [mainPool, storefrontPool].filter((p): p is Pool => p !== null);
  mainPool = null;
  storefrontPool = null;
  mainDb = null;
  storefrontDb = null;
  await Promise.all(pools.map((p) => p.end()));
}

export { schema };
