import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { importRows, type RowStage, type RowStatus } from "@/db/schema";
import type { CleanedRow, RawRow } from "@/core/types";

export type ImportRowRecord = typeof importRows.$inferSelect;

export const ROW_CHUNK_SIZE = 500;

/** Insert raw rows in chunks; re-running is a no-op thanks to the (import_id, row_number) unique index (EC-E1). */
export async function insertRawRows(db: DbOrTx, importId: string, storeId: string, rows: RawRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += ROW_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + ROW_CHUNK_SIZE);
    const result = await db
      .insert(importRows)
      .values(chunk.map((r) => ({ importId, storeId, rowNumber: r.rowNumber, raw: r.cells })))
      .onConflictDoNothing({ target: [importRows.importId, importRows.rowNumber] })
      .returning({ id: importRows.id });
    inserted += result.length;
  }
  return inserted;
}

/** Rows of one chunk that still need cleaning. Idempotent: already-cleaned rows are skipped. */
export async function getRowsForChunk(db: DbOrTx, importId: string, chunkIndex: number, stage: RowStage): Promise<ImportRowRecord[]> {
  const from = chunkIndex * ROW_CHUNK_SIZE + 1;
  const to = from + ROW_CHUNK_SIZE - 1;
  return db
    .select()
    .from(importRows)
    .where(and(eq(importRows.importId, importId), gte(importRows.rowNumber, from), lte(importRows.rowNumber, to), eq(importRows.stage, stage)))
    .orderBy(asc(importRows.rowNumber));
}

export async function listChunksAtStage(db: DbOrTx, importId: string, stage: RowStage): Promise<number[]> {
  const result = await db.execute<{ chunk: string }>(sql`
    select distinct ((row_number - 1) / ${ROW_CHUNK_SIZE})::int::text as chunk
      from import_rows where import_id = ${importId} and stage = ${stage}
     order by 1
  `);
  return result.rows.map((r) => Number(r.chunk));
}

export async function saveCleanedRows(db: DbOrTx, importId: string, cleaned: CleanedRow[]): Promise<void> {
  for (const c of cleaned) {
    await db
      .update(importRows)
      .set({ cleaned: c, rowHash: c.rowHash, issues: c.issues, stage: "cleaned", updatedAt: new Date() })
      .where(and(eq(importRows.importId, importId), eq(importRows.rowNumber, c.rowNumber), eq(importRows.stage, "parsed")));
  }
}

export async function getAllCleanedRows(db: DbOrTx, importId: string): Promise<Array<{ rowNumber: number; cleaned: CleanedRow; raw: Record<string, string> }>> {
  const rows = await db
    .select({ rowNumber: importRows.rowNumber, cleaned: importRows.cleaned, raw: importRows.raw })
    .from(importRows)
    .where(and(eq(importRows.importId, importId), inArray(importRows.stage, ["cleaned", "grouped", "done"])))
    .orderBy(asc(importRows.rowNumber));
  return rows.filter((r): r is { rowNumber: number; cleaned: CleanedRow; raw: Record<string, string> } => r.cleaned !== null).map((r) => ({ rowNumber: r.rowNumber, cleaned: r.cleaned as CleanedRow, raw: r.raw }));
}

export async function getRawCells(db: DbOrTx, importId: string, rowNumbers: number[]): Promise<Array<{ row: number; cells: Record<string, string> }>> {
  if (rowNumbers.length === 0) return [];
  const rows = await db
    .select({ rowNumber: importRows.rowNumber, raw: importRows.raw })
    .from(importRows)
    .where(and(eq(importRows.importId, importId), inArray(importRows.rowNumber, rowNumbers)))
    .orderBy(asc(importRows.rowNumber));
  return rows.map((r) => ({ row: r.rowNumber, cells: r.raw }));
}

/** Link rows to their product after grouping; duplicates are closed out as done immediately (EC-C3). */
export async function assignRowsToProduct(db: DbOrTx, importId: string, rowNumbers: number[], productId: string, productKey: string): Promise<void> {
  if (rowNumbers.length === 0) return;
  await db
    .update(importRows)
    .set({ productId, productKey, stage: "grouped", updatedAt: new Date() })
    .where(and(eq(importRows.importId, importId), inArray(importRows.rowNumber, rowNumbers)));
}

export async function markDuplicateRows(db: DbOrTx, importId: string, duplicates: Array<{ row: number; of: number }>, productIdByRow: Map<number, string>): Promise<void> {
  for (const d of duplicates) {
    const productId = productIdByRow.get(d.of) ?? null;
    await db
      .update(importRows)
      .set({ duplicateOfRow: d.of, productId, stage: "done", status: "done", failureReason: null, updatedAt: new Date() })
      .where(and(eq(importRows.importId, importId), eq(importRows.rowNumber, d.row)));
  }
}

/**
 * Terminal row status rolls up from the product outcome (EC-E9). Pass the import: a product is shared
 * by every import that touched it, and one import's outcome must not rewrite another's rows (EC-E8).
 * Without an import id every import's rows for the product are updated (legacy callers only).
 */
export async function setRowsStatusForProduct(db: DbOrTx, productId: string, status: RowStatus, failureReason: string | null = null, importId: string | null = null): Promise<number> {
  const rows = await db
    .update(importRows)
    .set({ status, failureReason, stage: "done", lockedAt: null, updatedAt: new Date() })
    .where(importId ? and(eq(importRows.importId, importId), eq(importRows.productId, productId)) : eq(importRows.productId, productId))
    .returning({ id: importRows.id });
  return rows.length;
}

/** A clean job that gave up: its chunk's uncleaned rows end as Failed with the reason, so counts add up (EC-E9). */
export async function failChunkRows(db: DbOrTx, importId: string, chunkIndex: number, reason: string): Promise<number> {
  const from = chunkIndex * ROW_CHUNK_SIZE + 1;
  const to = from + ROW_CHUNK_SIZE - 1;
  const rows = await db
    .update(importRows)
    .set({ status: "failed", stage: "done", failureReason: reason.slice(0, 500), lockedAt: null, updatedAt: new Date() })
    .where(and(eq(importRows.importId, importId), gte(importRows.rowNumber, from), lte(importRows.rowNumber, to), eq(importRows.stage, "parsed")))
    .returning({ id: importRows.id });
  return rows.length;
}

/** Any row still pending/processing when an import is cancelled ends as Failed with a reason (EC-E11). */
export async function failOpenRows(db: DbOrTx, importId: string, reason: string): Promise<number> {
  const rows = await db
    .update(importRows)
    .set({ status: "failed", stage: "done", failureReason: reason, updatedAt: new Date() })
    .where(and(eq(importRows.importId, importId), inArray(importRows.status, ["pending", "processing"])))
    .returning({ id: importRows.id });
  return rows.length;
}

export async function listRows(
  db: DbOrTx,
  importId: string,
  opts: { status?: RowStatus; limit?: number; offset?: number; search?: string } = {},
): Promise<{ rows: ImportRowRecord[]; total: number }> {
  const conditions = [eq(importRows.importId, importId)];
  if (opts.status) conditions.push(eq(importRows.status, opts.status));
  if (opts.search) conditions.push(sql`${importRows.raw}::text ilike ${`%${opts.search}%`}`);
  const where = and(...conditions);
  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(importRows).where(where);
  const rows = await db
    .select()
    .from(importRows)
    .where(where)
    .orderBy(asc(importRows.rowNumber))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return { rows, total: countRow?.n ?? 0 };
}
