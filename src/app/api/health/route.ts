import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { json } from "@/lib/http";
import { queueDepth } from "@/queue/queue";

export const dynamic = "force-dynamic";

/** Used by the host for restarts (EC-J3). Never throws: a bad database answers 503 with details. */
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
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
