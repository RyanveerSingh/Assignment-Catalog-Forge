import { eq } from "drizzle-orm";
import { detectCurrencyInHeader } from "@/core/clean/currency";
import type { NumberLocale } from "@/core/clean/price";
import { cleanRow, findMapping, type CleanRowContext } from "@/core/clean/row";
import type { ColumnMapping } from "@/core/types";
import { getImportById } from "@/db/repositories/imports";
import { getRowsForChunk, saveCleanedRows } from "@/db/repositories/rows";
import { stores } from "@/db/schema";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";

/** Stage 2: clean one chunk of 500 rows. Already-cleaned rows are skipped, so re-runs are free (EC-E1). */
export const cleanHandler: JobHandler = async ({ job, db, log, signal }) => {
  const importId = job.importId;
  const chunk = Number(job.payload.chunk);
  if (!importId || !Number.isInteger(chunk)) throw new JobError("clean job needs importId and chunk", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp) return;
  if (imp.status !== "cleaning") {
    log.info({ status: imp.status }, "clean skipped: import not in cleaning state");
    return;
  }
  const [store] = await db.select({ defaultCurrency: stores.defaultCurrency }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const ctx = contextFromImport(imp.columnMap as ColumnMapping[] | null, imp.parseMeta as Record<string, unknown> | null, store?.defaultCurrency ?? "EUR");

  const rows = await getRowsForChunk(db, importId, chunk, "parsed");
  if (rows.length === 0) {
    await driveImport(db, importId);
    return;
  }
  const cleaned = rows.map((r) => cleanRow({ rowNumber: r.rowNumber, cells: r.raw }, ctx));
  if (signal.aborted) throw new JobError("lease lost while cleaning", { retryable: true, retryAfterMs: 0 });
  await saveCleanedRows(db, importId, cleaned);
  log.info({ chunk, rows: cleaned.length }, "chunk cleaned");
  await driveImport(db, importId);
};

export function contextFromImport(mappings: ColumnMapping[] | null, meta: Record<string, unknown> | null, defaultCurrency: string): CleanRowContext {
  const maps = mappings ?? [];
  const priceMap = findMapping(maps, "price");
  const compareMap = findMapping(maps, "compare_at_price");
  const locale = (v: unknown): NumberLocale => (v === "eu" || v === "us" ? v : "unknown");
  return {
    mappings: maps,
    defaultCurrency,
    priceLocale: locale(meta?.priceLocale),
    compareAtLocale: locale(meta?.compareAtLocale),
    priceHeaderCurrency: priceMap ? detectCurrencyInHeader(priceMap.originalHeader) : null,
    compareAtHeaderCurrency: compareMap ? detectCurrencyInHeader(compareMap.originalHeader) : null,
  };
};
