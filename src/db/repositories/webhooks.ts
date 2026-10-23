import { and, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { WebhookPayload } from "@/core/webhooks/payload";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";

export type WebhookRow = typeof webhooks.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type WebhookDeliveryStatus = WebhookDeliveryRow["status"];

/** What the Settings list shows per webhook: the newest delivery, if any. */
export interface WebhookLastDelivery {
  id: string;
  event: string;
  status: WebhookDeliveryStatus;
  responseCode: number | null;
  attempt: number;
  createdAt: Date;
}

export async function createWebhook(db: DbOrTx, storeId: string, input: { url: string; events: string[]; secret: string }): Promise<WebhookRow> {
  const [row] = await db
    .insert(webhooks)
    .values({ storeId, url: input.url, events: input.events, secret: encryptSecret(input.secret), active: true })
    .returning();
  if (!row) throw new Error("webhook insert returned no row");
  return row;
}

export async function listWebhooks(db: DbOrTx, storeId: string): Promise<WebhookRow[]> {
  return db.select().from(webhooks).where(eq(webhooks.storeId, storeId)).orderBy(webhooks.createdAt);
}

export async function getWebhook(db: DbOrTx, storeId: string, webhookId: string): Promise<WebhookRow | null> {
  const [row] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.storeId, storeId), eq(webhooks.id, webhookId)))
    .limit(1);
  return row ?? null;
}

export async function setWebhookActive(db: DbOrTx, storeId: string, webhookId: string, active: boolean): Promise<WebhookRow | null> {
  const [row] = await db
    .update(webhooks)
    .set({ active })
    .where(and(eq(webhooks.storeId, storeId), eq(webhooks.id, webhookId)))
    .returning();
  return row ?? null;
}

/** Deliveries go with it (cascade), including any still queued: their job finds nothing and ends quietly. */
export async function deleteWebhook(db: DbOrTx, storeId: string, webhookId: string): Promise<boolean> {
  const rows = await db
    .delete(webhooks)
    .where(and(eq(webhooks.storeId, storeId), eq(webhooks.id, webhookId)))
    .returning({ id: webhooks.id });
  return rows.length > 0;
}

/** Active webhooks whose `events` array contains the event (jsonb containment, index-free but the list is tiny). */
export async function listSubscribedWebhooks(db: DbOrTx, storeId: string, event: string): Promise<WebhookRow[]> {
  return db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.storeId, storeId), eq(webhooks.active, true), sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`))
    .orderBy(webhooks.createdAt);
}

/**
 * One delivery per (webhook, event id): the unique index plus ON CONFLICT DO NOTHING make a second
 * finalize run a no-op (EC-I10). Returns null when the delivery already existed.
 */
export async function createDelivery(
  db: DbOrTx,
  storeId: string,
  input: { webhookId: string; event: string; eventId: string; payload: WebhookPayload },
): Promise<WebhookDeliveryRow | null> {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({ storeId, webhookId: input.webhookId, event: input.event, eventId: input.eventId, payload: { ...input.payload }, status: "pending", attempt: 0 })
    .onConflictDoNothing({ target: [webhookDeliveries.webhookId, webhookDeliveries.eventId] })
    .returning();
  return row ?? null;
}

/** Worker-side read: the delivery with its webhook, both scoped to the store the job carries. */
export async function getDeliveryWithWebhook(db: DbOrTx, storeId: string, deliveryId: string): Promise<{ delivery: WebhookDeliveryRow; webhook: WebhookRow } | null> {
  const [row] = await db
    .select({ delivery: webhookDeliveries, webhook: webhooks })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhookDeliveries.storeId, storeId), eq(webhookDeliveries.id, deliveryId)))
    .limit(1);
  return row ?? null;
}

export interface DeliveryAttemptResult {
  status: WebhookDeliveryStatus;
  /** The attempt number this result belongs to (the queue's 1-based attempt), set rather than incremented so a re-run cannot double count. */
  attempt: number;
  responseCode: number | null;
  /** The log line: an HTTP status with a bounded response excerpt, a timeout, or a connection error. Null when delivered. */
  error: string | null;
  nextAttemptAt: Date | null;
}

export async function recordDeliveryAttempt(db: DbOrTx, storeId: string, deliveryId: string, result: DeliveryAttemptResult): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({ status: result.status, attempt: result.attempt, responseCode: result.responseCode, error: result.error, nextAttemptAt: result.nextAttemptAt })
    .where(and(eq(webhookDeliveries.storeId, storeId), eq(webhookDeliveries.id, deliveryId)));
}

/** The dead-job backstop: whatever the last attempt said, a delivery the queue gave up on is Failed, never left Pending. */
export async function failPendingDelivery(db: DbOrTx, storeId: string, deliveryId: string, error: string, attempt: number): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({ status: "failed", error: error.slice(0, 500), nextAttemptAt: null, attempt: sql`greatest(${webhookDeliveries.attempt}, ${attempt})` })
    .where(and(eq(webhookDeliveries.storeId, storeId), eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.status, "pending")));
}

export async function listDeliveries(db: DbOrTx, storeId: string, webhookId: string, limit = 20): Promise<WebhookDeliveryRow[]> {
  return db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.storeId, storeId), eq(webhookDeliveries.webhookId, webhookId)))
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(Math.max(1, Math.min(limit, 100)));
}

/** Newest delivery per webhook of the store, for the list view. */
export async function lastDeliveriesByWebhook(db: DbOrTx, storeId: string): Promise<Map<string, WebhookLastDelivery>> {
  const rows = await db
    .selectDistinctOn([webhookDeliveries.webhookId], {
      webhookId: webhookDeliveries.webhookId,
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      responseCode: webhookDeliveries.responseCode,
      attempt: webhookDeliveries.attempt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.storeId, storeId))
    .orderBy(webhookDeliveries.webhookId, desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id));
  const out = new Map<string, WebhookLastDelivery>();
  for (const r of rows) out.set(r.webhookId, { id: r.id, event: r.event, status: r.status, responseCode: r.responseCode, attempt: r.attempt, createdAt: r.createdAt });
  return out;
}
