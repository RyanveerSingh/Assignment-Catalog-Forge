import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { ACTIVE_IMPORT_STATUSES, importEvents, importFiles, importRows, imports, type ImportCounts, type ImportStatus } from "@/db/schema";
import { getBus } from "@/lib/events";

export type ImportRow = typeof imports.$inferSelect;

export interface CreateImportInput {
  storeId: string;
  name: string;
  mode?: "fast" | "economy";
  budgetCents?: number;
  promptVersion?: string;
}

export async function createImport(db: DbOrTx, input: CreateImportInput): Promise<ImportRow> {
  const [row] = await db
    .insert(imports)
    .values({
      storeId: input.storeId,
      name: input.name,
      mode: input.mode ?? "fast",
      budgetCents: input.budgetCents ?? 500,
      promptVersion: input.promptVersion ?? "v1",
      status: "uploading",
    })
    .returning();
  if (!row) throw new Error("import insert returned no row");
  return row;
}

export async function getImport(db: DbOrTx, storeId: string, importId: string): Promise<ImportRow | null> {
  const [row] = await db.select().from(imports).where(and(eq(imports.storeId, storeId), eq(imports.id, importId))).limit(1);
  return row ?? null;
}

/** Worker-side lookup without a store scope (jobs carry the import id and are already store-bound). */
export async function getImportById(db: DbOrTx, importId: string): Promise<ImportRow | null> {
  const [row] = await db.select().from(imports).where(eq(imports.id, importId)).limit(1);
  return row ?? null;
}

export async function listImports(db: DbOrTx, storeId: string, opts: { limit?: number; offset?: number } = {}): Promise<ImportRow[]> {
  return db
    .select()
    .from(imports)
    .where(eq(imports.storeId, storeId))
    .orderBy(desc(imports.createdAt))
    .limit(opts.limit ?? 25)
    .offset(opts.offset ?? 0);
}

export async function listActiveImports(db: DbOrTx): Promise<ImportRow[]> {
  return db.select().from(imports).where(inArray(imports.status, [...ACTIVE_IMPORT_STATUSES]));
}

/** EC-E6: the same file cannot be imported twice at once. Returns the existing active import if any. */
export async function findActiveImportByHash(db: DbOrTx, storeId: string, fileHash: string): Promise<ImportRow | null> {
  const [row] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.storeId, storeId), eq(imports.fileHash, fileHash), inArray(imports.status, [...ACTIVE_IMPORT_STATUSES])))
    .limit(1);
  return row ?? null;
}

export async function attachImportFile(
  db: DbOrTx,
  input: { importId: string; storeId: string; kind: "sheet" | "photo" | "zip"; blobId: string; sha256: string; size: number; mime: string; originalName: string },
): Promise<void> {
  await db.insert(importFiles).values(input);
}

export async function listImportFiles(db: DbOrTx, importId: string): Promise<Array<typeof importFiles.$inferSelect>> {
  return db.select().from(importFiles).where(eq(importFiles.importId, importId));
}

export async function updateImport(db: DbOrTx, importId: string, patch: Partial<typeof imports.$inferInsert>): Promise<void> {
  await db
    .update(imports)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(imports.id, importId));
}

/** Compare-and-set status transition; returns false when the import was no longer in `from` (EC-E1). */
export async function transitionImport(db: DbOrTx, importId: string, from: ImportStatus | ImportStatus[], to: ImportStatus, patch: Partial<typeof imports.$inferInsert> = {}): Promise<boolean> {
  const fromList = Array.isArray(from) ? from : [from];
  const rows = await db
    .update(imports)
    .set({ status: to, ...patch, updatedAt: new Date() })
    .where(and(eq(imports.id, importId), inArray(imports.status, fromList)))
    .returning({ id: imports.id });
  return rows.length > 0;
}

export async function pauseImport(db: DbOrTx, importId: string, until: Date | null, reason: string): Promise<void> {
  const current = await getImportById(db, importId);
  if (!current || current.status === "paused") {
    await updateImport(db, importId, { pausedUntil: until, pauseReason: reason });
    return;
  }
  await updateImport(db, importId, { status: "paused", resumeStatus: current.status, pausedUntil: until, pauseReason: reason });
  await appendImportEvent(db, importId, "warn", `Paused: ${reason}`, until ? { until: until.toISOString() } : undefined);
}

export async function resumeImport(db: DbOrTx, importId: string): Promise<boolean> {
  const current = await getImportById(db, importId);
  if (!current || current.status !== "paused") return false;
  await updateImport(db, importId, { status: current.resumeStatus ?? "queued", resumeStatus: null, pausedUntil: null, pauseReason: null });
  await appendImportEvent(db, importId, "info", "Resumed");
  return true;
}

export async function appendImportEvent(db: DbOrTx, importId: string, level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>): Promise<void> {
  const [row] = await db
    .insert(importEvents)
    .values({ importId, level, message, data: data ?? null })
    .returning({ id: importEvents.id, createdAt: importEvents.createdAt });
  if (row) {
    getBus().emit("import:log", { importId, id: row.id, level, message, data, createdAt: row.createdAt.toISOString() });
  }
}

export async function listImportEvents(db: DbOrTx, importId: string, afterId = 0, limit = 200): Promise<Array<typeof importEvents.$inferSelect>> {
  return db
    .select()
    .from(importEvents)
    .where(and(eq(importEvents.importId, importId), sql`${importEvents.id} > ${afterId}`))
    .orderBy(importEvents.id)
    .limit(limit);
}

/** Recount rows by status from the rows table (the only truth) and publish progress (EC-E9). */
export async function recomputeImportCounts(db: DbOrTx, importId: string): Promise<ImportCounts> {
  const result = await db.execute<{ status: keyof ImportCounts; n: string }>(sql`
    select status, count(*)::text as n from import_rows where import_id = ${importId} group by status
  `);
  const counts: ImportCounts = { pending: 0, processing: 0, done: 0, needs_review: 0, failed: 0 };
  for (const r of result.rows) counts[r.status] = Number(r.n);
  const [row] = await db
    .update(imports)
    .set({ counts, updatedAt: new Date() })
    .where(eq(imports.id, importId))
    .returning({ storeId: imports.storeId, status: imports.status, totalRows: imports.totalRows, productCount: imports.productCount, pausedUntil: imports.pausedUntil, pauseReason: imports.pauseReason });
  if (row) {
    getBus().emit("import:progress", {
      importId,
      storeId: row.storeId,
      status: row.status,
      counts,
      totalRows: row.totalRows,
      productCount: row.productCount,
      pausedUntil: row.pausedUntil?.toISOString() ?? null,
      pauseReason: row.pauseReason,
    });
  }
  return counts;
}

export async function countRowsByStage(db: DbOrTx, importId: string): Promise<Record<string, number>> {
  const result = await db.execute<{ stage: string; n: string }>(sql`
    select stage, count(*)::text as n from import_rows where import_id = ${importId} group by stage
  `);
  const out: Record<string, number> = {};
  for (const r of result.rows) out[r.stage] = Number(r.n);
  return out;
}

export { importRows };
