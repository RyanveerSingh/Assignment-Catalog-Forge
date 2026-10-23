import { z } from "zod";
import { getDb } from "@/db/client";
import { deleteWebhook, lastDeliveriesByWebhook, setWebhookActive } from "@/db/repositories/webhooks";
import { HttpError, json, withApi } from "@/lib/http";
import { serializeWebhook } from "@/lib/serializers";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

const patchSchema = z.object({ active: z.boolean() });

/** Pause or resume a webhook without losing its secret; a disabled webhook gets no deliveries. */
export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can change webhooks");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Pass { active: true | false }");
  const db = getDb();
  const row = await setWebhookActive(db, store.id, id, parsed.data.active);
  if (!row) throw new HttpError(404, "webhook_not_found", "Webhook not found");
  const last = await lastDeliveriesByWebhook(db, store.id);
  return json({ webhook: serializeWebhook(row, last.get(row.id) ?? null) });
});

export const DELETE = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can delete webhooks");
  const removed = await deleteWebhook(getDb(), store.id, id);
  if (!removed) throw new HttpError(404, "webhook_not_found", "Webhook not found");
  return json({ ok: true });
});
