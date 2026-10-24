import { getDb } from "@/db/client";
import { getWebhook, listDeliveries } from "@/db/repositories/webhooks";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { requireUuidParam } from "@/lib/ids";
import { serializeWebhookDelivery } from "@/lib/serializers";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** Recent deliveries, newest first: status, HTTP code, attempts, timestamps and the last error. */
export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const id = requireUuidParam(rawId, "webhook_not_found", "Webhook not found");
  const { store } = await requireStore(slug);
  const db = getDb();
  const webhook = await getWebhook(db, store.id, id);
  if (!webhook) throw new HttpError(404, "webhook_not_found", "Webhook not found");
  const limit = parseIntParam(new URL(req.url).searchParams.get("limit"), 20, 1, 100);
  const rows = await listDeliveries(db, store.id, id, limit);
  return json({ deliveries: rows.map(serializeWebhookDelivery) });
});
