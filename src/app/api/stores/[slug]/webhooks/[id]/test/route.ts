import { getDb } from "@/db/client";
import { getWebhook } from "@/db/repositories/webhooks";
import { enqueueTestDelivery } from "@/jobs/webhook";
import { HttpError, json, withApi } from "@/lib/http";
import { requireUuidParam } from "@/lib/ids";
import { serializeWebhookDelivery } from "@/lib/serializers";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** Queues a `webhook.test` delivery through the real job, so the test proves signing, retries and the log, not a shortcut. */
export const POST = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const id = requireUuidParam(rawId, "webhook_not_found", "Webhook not found");
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can send test deliveries");
  const db = getDb();
  const webhook = await getWebhook(db, store.id, id);
  if (!webhook) throw new HttpError(404, "webhook_not_found", "Webhook not found");
  if (!webhook.active) throw new HttpError(409, "webhook_disabled", "Enable the webhook before sending a test");
  const delivery = await enqueueTestDelivery(db, { id: store.id, slug: store.slug }, webhook);
  return json({ deliveryId: delivery.id, delivery: serializeWebhookDelivery(delivery) }, { status: 202 });
});
