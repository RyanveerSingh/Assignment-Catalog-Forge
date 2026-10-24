import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { json } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { queueDepth } from "@/queue/queue";

export const dynamic = "force-dynamic";

/** Used by the host for restarts (EC-J3). Never throws: a bad database answers 503; the cause goes to the log, not the public. */
export async function GET(): Promise<Response> {
  const started = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    const depth = await queueDepth(db);
    return json({
      ok: true,
      dbLatencyMs: Date.now() - started,
      workerMode: process.env.WORKER_MODE ?? "embedded",
      aiProvider: process.env.AI_PROVIDER ?? "mock",
      queues: depth,
      time: new Date().toISOString(),
    });
  } catch (err) {
    getLogger({ component: "health" }).error({ err }, "health check failed");
    return json({ ok: false, error: "The database is unavailable" }, { status: 503 });
  }
}
