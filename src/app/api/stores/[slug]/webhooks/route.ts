import { z } from "zod";
import { IMPORT_WEBHOOK_EVENTS } from "@/core/webhooks/payload";
import { getDb } from "@/db/client";
import { createWebhook, lastDeliveriesByWebhook, listWebhooks } from "@/db/repositories/webhooks";
import { randomToken } from "@/lib/crypto";
import { HttpError, json, withApi } from "@/lib/http";
import { assertPublicHttpUrl, PublicUrlError } from "@/lib/public-url";
import { serializeWebhook } from "@/lib/serializers";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_WEBHOOKS_PER_STORE = 20;

/** Listed without secrets (EC-I2): the secret is shown once, at creation, and only ever decrypted to sign. */
export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const db = getDb();
  const [rows, last] = await Promise.all([listWebhooks(db, store.id), lastDeliveriesByWebhook(db, store.id)]);
  return json({ webhooks: rows.map((r) => serializeWebhook(r, last.get(r.id) ?? null)) });
});

const createSchema = z.object({
  url: z.string().trim().min(1).max(2_000),
  events: z.array(z.enum(IMPORT_WEBHOOK_EVENTS)).min(1).max(IMPORT_WEBHOOK_EVENTS.length),
});

/** Creates a webhook; the signing secret is returned once in this response and stored encrypted (EC-I4, J5). */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can add webhooks");
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Give a URL and at least one event", parsed.error.issues);
  let url: URL;
  try {
    url = await assertPublicHttpUrl(parsed.data.url);
  } catch (err) {
    if (err instanceof PublicUrlError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
  const db = getDb();
  const existing = await listWebhooks(db, store.id);
  if (existing.length >= MAX_WEBHOOKS_PER_STORE) throw new HttpError(409, "too_many_webhooks", `A store can have at most ${MAX_WEBHOOKS_PER_STORE} webhooks`);
  const secret = `whsec_${randomToken(32)}`;
  const events = [...new Set(parsed.data.events)];
  const row = await createWebhook(db, store.id, { url: url.toString(), events, secret });
  return json({ webhook: serializeWebhook(row, null), secret }, { status: 201 });
});
