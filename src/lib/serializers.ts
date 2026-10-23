import type { ImportRow } from "@/db/repositories/imports";

/** Wire shape of an import for the dashboard and the public API. Dates become ISO strings. */
export function serializeImport(row: ImportRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    resumeStatus: row.resumeStatus,
    mode: row.mode,
    totalRows: row.totalRows,
    counts: row.counts,
    productCount: row.productCount,
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    pauseReason: row.pauseReason,
    costMicros: row.costMicros,
    costSummary: row.costSummary,
    budgetCents: row.budgetCents,
    promptVersion: row.promptVersion,
    error: row.error,
    parseMeta: row.parseMeta,
    columnMap: row.columnMap,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

