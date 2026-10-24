import { eq } from "drizzle-orm";
import { buildCleanRowContext } from "@/core/clean/row";
import { mapColumns } from "@/core/parse/headers";
import { parseSheet } from "@/core/parse/sheet";
import type { ColumnMapping, RawRow } from "@/core/types";
import { appendImportEvent, getImportById, listImportFiles, recomputeImportCounts, transitionImport, updateImport } from "@/db/repositories/imports";
import { insertRawRows } from "@/db/repositories/rows";
import { stores } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { getStorage } from "@/providers/storage";
import { JobError } from "@/queue/errors";
import { enqueue } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { JOB_TYPES, jobKeys, priorityFor } from "./keys";

/**
 * Stage 1: read the sheet, detect everything, map columns, store raw rows.
 * Idempotent: rows insert with ON CONFLICT DO NOTHING and the status transition is a CAS (EC-E1).
 */
export const ingestHandler: JobHandler = async ({ job, db, log }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("ingest job without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp || imp.status !== "parsing") {
    log.info({ status: imp?.status }, "ingest skipped: import not in parsing state");
    return;
  }
  const files = await listImportFiles(db, importId);
  const sheet = files.find((f) => f.kind === "sheet");
  if (!sheet) {
    await transitionImport(db, importId, "parsing", "failed", { error: "No sheet file attached" });
    await appendImportEvent(db, importId, "error", "No sheet file attached to this import");
    return;
  }
  const blob = await getStorage().get(imp.storeId, sheet.blobId);
  if (!blob) {
    await transitionImport(db, importId, "parsing", "failed", { error: "Sheet file is missing from storage" });
    await appendImportEvent(db, importId, "error", "Sheet file is missing from storage");
    return;
  }

  const cfg = getConfig();
  const parsed = parseSheet(blob.data, { filename: sheet.originalName, maxRows: cfg.MAX_ROWS_PER_IMPORT });
  const fatal = parsed.issues.find((i) => i.severity === "error");
  if (fatal && parsed.rows.length === 0) {
    await transitionImport(db, importId, "parsing", "failed", { error: fatal.message, parseMeta: metaFrom(parsed, [], null) });
    await appendImportEvent(db, importId, "error", fatal.message, { code: fatal.code });
    return;
  }

  const [store] = await db.select({ defaultCurrency: stores.defaultCurrency }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const defaultCurrency = store?.defaultCurrency ?? "EUR";
  const sample = parsed.rows.slice(0, 50).map((r) => parsed.headers.map((h) => r.cells[h] ?? ""));
  const mappings = mapColumns(parsed.originalHeaders, sample);
  const ctx = buildCleanRowContext(parsed, mappings, defaultCurrency);

  const inserted = await insertRawRows(db, importId, imp.storeId, parsed.rows as RawRow[]);
  log.info({ rows: parsed.rows.length, inserted, format: parsed.format, encoding: parsed.encoding }, "sheet parsed");

  await updateImport(db, importId, {
    totalRows: parsed.rows.length,
    columnMap: mappings,
    parseMeta: metaFrom(parsed, mappings, { priceLocale: ctx.priceLocale, compareAtLocale: ctx.compareAtLocale, priceColumnCurrency: ctx.priceColumnCurrency ?? null }),
  });
  await appendImportEvent(db, importId, "info", `Parsed ${parsed.rows.length} rows from ${sheet.originalName}`, {
    format: parsed.format,
    encoding: parsed.encoding,
    delimiter: parsed.delimiter,
    sheetName: parsed.sheetName,
    headerRowIndex: parsed.headerRowIndex,
    mapped: mappings.filter((m) => m.canonical).map((m) => `${m.originalHeader} → ${m.canonical}`),
    unmapped: mappings.filter((m) => !m.canonical).map((m) => m.originalHeader),
  });
  for (const i of parsed.issues.filter((x) => x.severity !== "info" && x.row === undefined)) {
    await appendImportEvent(db, importId, i.severity === "error" ? "error" : "warn", i.message, { code: i.code });
  }
  if (parsed.rows.length === 0) {
    await transitionImport(db, importId, "parsing", "completed", { finishedAt: new Date() });
    await appendImportEvent(db, importId, "warn", "The sheet has a header but no data rows (EC-A16)");
    return;
  }

  // Photos are processed in parallel with cleaning; matching runs after both (EC-C12).
  if (files.some((f) => f.kind === "photo" || f.kind === "zip")) {
    await enqueue(db, { key: jobKeys.photos(importId), type: JOB_TYPES.photos, storeId: imp.storeId, importId, priority: priorityFor(parsed.rows.length) });
  }

  await transitionImport(db, importId, "parsing", "cleaning");
  await recomputeImportCounts(db, importId);
  await driveImport(db, importId);
};

function metaFrom(parsed: ReturnType<typeof parseSheet>, mappings: ColumnMapping[], locales: { priceLocale: string; compareAtLocale: string; priceColumnCurrency: string | null } | null) {
  return {
    format: parsed.format,
    encoding: parsed.encoding,
    delimiter: parsed.delimiter,
    sheetName: parsed.sheetName,
    headerRowIndex: parsed.headerRowIndex,
    headers: parsed.headers,
    originalHeaders: parsed.originalHeaders,
    issues: parsed.issues.filter((i) => i.row === undefined),
    totalRowsInFile: parsed.totalRows,
    truncated: parsed.truncated,
    mappedCount: mappings.filter((m) => m.canonical).length,
    ...(locales ?? {}),
  };
}
