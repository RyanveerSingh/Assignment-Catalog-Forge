import type { ImportRow } from "@/db/repositories/imports";
import type { WebhookDeliveryRow, WebhookLastDelivery, WebhookRow } from "@/db/repositories/webhooks";

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

/** Wire shape of a webhook for Settings. The secret column is never part of it (EC-I2). */
export function serializeWebhook(row: WebhookRow, last: WebhookLastDelivery | null) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    lastDelivery: last
      ? { id: last.id, event: last.event, status: last.status, responseCode: last.responseCode, attempt: last.attempt, createdAt: last.createdAt.toISOString() }
      : null,
  };
}

export type WebhookDto = ReturnType<typeof serializeWebhook>;

/** The delivery log row. The payload is left out: it is what was sent, and the receiver already has it. */
export function serializeWebhookDelivery(row: WebhookDeliveryRow) {
  return {
    id: row.id,
    event: row.event,
    status: row.status,
    responseCode: row.responseCode,
    attempt: row.attempt,
    error: row.error,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type WebhookDeliveryDto = ReturnType<typeof serializeWebhookDelivery>;

