import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  buildDeliveryHeaders,
  classifyDeliveryResult,
  DELIVERY_TIMEOUT_MS,
  MAX_DELIVERY_ATTEMPTS,
  MAX_RESPONSE_BYTES,
  responseSnippet,
  type DeliveryResult,
} from "@/core/webhooks/delivery";
import { buildImportEventPayload, buildTestEventPayload, importEventId, type ImportWebhookEvent } from "@/core/webhooks/payload";
import type { DbOrTx } from "@/db/client";
import { appendImportEvent, type ImportRow } from "@/db/repositories/imports";
import { createDelivery, failPendingDelivery, getDeliveryWithWebhook, listSubscribedWebhooks, recordDeliveryAttempt, type WebhookDeliveryRow, type WebhookRow } from "@/db/repositories/webhooks";
import { stores } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { wakeWorker } from "@/lib/events";
import { assertPublicHttpUrl, PublicUrlError } from "@/lib/public-url";
import { JobError } from "@/queue/errors";
import { backoffMs, enqueue, type Job } from "@/queue/queue";
import type { JobHandler } from "@/worker/loop";
import { JOB_TYPES, jobKeys } from "./keys";

/**
 * Deliver one webhook (EC-I4, I7, I9, I10). The delivery row is the state of record: the job sets
 * the attempt number from the queue's counter rather than incrementing, so a re-run after a crash
 * cannot double count, and a delivery that already succeeded is never sent twice.
 */
export const webhookHandler: JobHandler = async ({ job, db, log, signal }) => {
  const deliveryId = typeof job.payload.deliveryId === "string" ? job.payload.deliveryId : null;
  const storeId = job.storeId;
  if (!deliveryId || !storeId) throw new JobError("webhook job without deliveryId or storeId", { retryable: false });
  const found = await getDeliveryWithWebhook(db, storeId, deliveryId);
  // Webhook deleted (deliveries cascade) or delivery gone: nothing to do and nothing to report.
  if (!found) return;
  const { delivery, webhook } = found;
  if (delivery.status === "delivered") return;
  const attempt = job.attempts;
  const giveUp = async (error: string): Promise<never> => {
    await recordDeliveryAttempt(db, storeId, deliveryId, { status: "failed", attempt, responseCode: null, error, nextAttemptAt: null });
    throw new JobError(error, { retryable: false });
  };

  if (!webhook.active) return giveUp("Webhook is disabled");
  // The URL was checked when saved; checking again defeats a DNS record rebound to a private address since.
  const refused = await assertPublicHttpUrl(webhook.url).then(
    () => null,
    (err: unknown) => (err instanceof PublicUrlError ? `Refused: ${err.message}` : "Refused: the URL could not be checked"),
  );
  if (refused) return giveUp(refused);
  let secret: string;
  try {
    secret = decryptSecret(webhook.secret);
  } catch {
    return giveUp("The signing secret could not be read; delete this webhook and add it again");
  }

  const body = JSON.stringify(delivery.payload);
  const headers = buildDeliveryHeaders({ secret, event: delivery.event, deliveryId, body, timestamp: Math.floor(Date.now() / 1000) });
  const result = await sendDelivery(webhook.url, headers, body, { signal });
  const verdict = classifyDeliveryResult(result);
  const responseCode = result.kind === "response" ? result.status : null;
  log.info({ deliveryId, host: new URL(webhook.url).host, outcome: verdict.outcome, responseCode, attempt }, "webhook delivery attempt");

  if (verdict.outcome === "delivered") {
    await recordDeliveryAttempt(db, storeId, deliveryId, { status: "delivered", attempt, responseCode, error: null, nextAttemptAt: null });
    return;
  }
  if (verdict.outcome === "failed" || attempt >= job.maxAttempts) {
    await recordDeliveryAttempt(db, storeId, deliveryId, { status: "failed", attempt, responseCode, error: verdict.error, nextAttemptAt: null });
    throw new JobError(verdict.error ?? "delivery failed", { retryable: false });
  }
  // Same delay the queue will use, so the delivery log and the job agree on when the next try is.
  const retryAfterMs = backoffMs(attempt);
  await recordDeliveryAttempt(db, storeId, deliveryId, { status: "pending", attempt, responseCode, error: verdict.error, nextAttemptAt: new Date(Date.now() + retryAfterMs) });
  throw new JobError(verdict.error ?? "delivery failed", { retryable: true, retryAfterMs });
};

export interface SendOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The job's lease signal: a lost lease aborts the request so another worker can take over. */
  signal?: AbortSignal;
}

/** POST the body once. Redirects are returned as-is (3xx), bodies are read to 4 KB and no further. */
export async function sendDelivery(url: string, headers: Record<string, string>, body: string, opts: SendOptions = {}): Promise<DeliveryResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DELIVERY_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([controller.signal, opts.signal]) : controller.signal;
  try {
    const res = await fetchImpl(url, { method: "POST", headers, body, redirect: "manual", signal });
    const snippet = await readSnippet(res, controller);
    return { kind: "response", status: res.status, bodySnippet: snippet };
  } catch (err) {
    if (controller.signal.aborted) return { kind: "timeout" };
    const message = err instanceof Error ? (err.cause instanceof Error ? `${err.message} (${err.cause.message})` : err.message) : String(err);
    return { kind: "network", message };
  } finally {
    clearTimeout(timer);
  }
}

async function readSnippet(res: Response, controller: AbortController): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    // The verdict comes from the status line; a body that cannot be read is simply not quoted.
  } finally {
    if (size >= MAX_RESPONSE_BYTES) controller.abort();
    await reader.cancel().catch(() => undefined);
  }
  return responseSnippet(Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, MAX_RESPONSE_BYTES).toString("utf8"));
}

/** Insert the job for a delivery row; the deterministic key makes a second call a no-op. */
export async function enqueueDelivery(db: DbOrTx, delivery: WebhookDeliveryRow): Promise<boolean> {
  const { inserted } = await enqueue(db, {
    key: jobKeys.webhook(delivery.id),
    type: JOB_TYPES.webhook,
    queue: "default",
    payload: { deliveryId: delivery.id },
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
    storeId: delivery.storeId,
  });
  if (inserted) wakeWorker();
  return inserted;
}

/**
 * The finalize hook: one delivery per subscribed webhook, idempotent on the (webhook, event id)
 * unique index, so a re-run of finalize after a crash cannot notify a receiver twice (EC-I10).
 */
export async function enqueueImportWebhooks(db: DbOrTx, imp: ImportRow, event: ImportWebhookEvent): Promise<number> {
  const subscribed = await listSubscribedWebhooks(db, imp.storeId, event);
  if (subscribed.length === 0) return 0;
  const [store] = await db.select({ id: stores.id, slug: stores.slug }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  if (!store) return 0;
  const payload = buildImportEventPayload({ event, now: new Date(), store, import: imp });
  const eventId = importEventId(event, imp.id);
  let queued = 0;
  for (const webhook of subscribed) {
    const delivery = await createDelivery(db, imp.storeId, { webhookId: webhook.id, event, eventId, payload });
    if (!delivery) continue;
    await enqueueDelivery(db, delivery);
    await appendImportEvent(db, imp.id, "info", `Webhook queued for ${new URL(webhook.url).host}`, { webhookId: webhook.id, deliveryId: delivery.id, event });
    queued += 1;
  }
  return queued;
}

/** The Settings "Send test" button: a `webhook.test` event through the exact path a real event takes. */
export async function enqueueTestDelivery(db: DbOrTx, store: { id: string; slug: string }, webhook: WebhookRow): Promise<WebhookDeliveryRow> {
  const eventId = `webhook.test:${randomUUID()}`;
  const payload = buildTestEventPayload({ id: eventId, now: new Date(), store });
  const delivery = await createDelivery(db, store.id, { webhookId: webhook.id, event: "webhook.test", eventId, payload });
  if (!delivery) throw new Error("test delivery collided with an existing event id");
  await enqueueDelivery(db, delivery);
  return delivery;
}

/** Dead-job hook: the queue gave up, so the delivery must not stay Pending (EC-E9 applied to webhooks). */
export async function failWebhookDelivery(db: DbOrTx, job: Job, error: string): Promise<void> {
  const deliveryId = typeof job.payload.deliveryId === "string" ? job.payload.deliveryId : null;
  if (!deliveryId || !job.storeId) return;
  await failPendingDelivery(db, job.storeId, deliveryId, `Gave up after ${job.attempts} attempt(s): ${error}`, job.attempts);
}
