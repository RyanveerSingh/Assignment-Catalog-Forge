import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { createApiKey } from "@/lib/auth";
import { DEMO_MAX_API_KEYS, demoLocked, isLockedDemoUser } from "@/lib/demo-lockdown";
import { HttpError, json, withApi } from "@/lib/http";
import { isUuid } from "@/lib/ids";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const rows = await getDb()
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.storeId, store.id), isNull(apiKeys.revokedAt)));
  return json({ keys: rows.map((r) => ({ ...r, lastUsedAt: r.lastUsedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })) });
});

/** Creates a key; the full secret is returned once and never stored (EC-I2). */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store, user } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can create API keys");
  const parsed = z.object({ name: z.string().min(1).max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Give the key a name");
  const db = getDb();
  if (isLockedDemoUser(user)) {
    const [active] = await db.select({ n: sql<number>`count(*)::int` }).from(apiKeys).where(and(eq(apiKeys.storeId, store.id), isNull(apiKeys.revokedAt)));
    if ((active?.n ?? 0) >= DEMO_MAX_API_KEYS) throw demoLocked(`a store can have at most ${DEMO_MAX_API_KEYS} active API keys; revoke one first`);
  }
  const created = await createApiKey(db, store.id, parsed.data.name);
  return json({ id: created.id, key: created.key, prefix: created.prefix }, { status: 201 });
});

export const DELETE = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can revoke API keys");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "missing_id", "Pass ?id=");
  if (!isUuid(id)) throw new HttpError(404, "api_key_not_found", "API key not found");
  await getDb().update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.storeId, store.id), eq(apiKeys.id, id)));
  return json({ ok: true });
});
