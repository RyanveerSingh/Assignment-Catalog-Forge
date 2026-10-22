import { and, eq, gt } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { apiKeys, sessions, storeMembers, stores, users } from "@/db/schema";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";

export const SESSION_COOKIE = "cf_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface StoreAccess {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "editor";
}

export async function registerUser(db: DbOrTx, input: { email: string; password: string; name: string }): Promise<SessionUser> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db.insert(users).values({ email: input.email.toLowerCase().trim(), passwordHash, name: input.name.trim() }).returning({ id: users.id, email: users.email, name: users.name });
  if (!row) throw new Error("user insert returned no row");
  return row;
}

export async function authenticate(db: DbOrTx, email: string, password: string): Promise<SessionUser | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? { id: row.id, email: row.email, name: row.name } : null;
}

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: DbOrTx, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256Hex(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(db: DbOrTx, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function destroySession(db: DbOrTx, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

/** Stores the user belongs to. Every data access goes through one of these ids (EC-I1). */
export async function listUserStores(db: DbOrTx, userId: string): Promise<StoreAccess[]> {
  return db
    .select({ id: stores.id, slug: stores.slug, name: stores.name, role: storeMembers.role })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.userId, userId))
    .orderBy(stores.name);
}

export async function getUserStore(db: DbOrTx, userId: string, storeSlug: string): Promise<StoreAccess | null> {
  const [row] = await db
    .select({ id: stores.id, slug: stores.slug, name: stores.name, role: storeMembers.role })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(and(eq(storeMembers.userId, userId), eq(stores.slug, storeSlug)))
    .limit(1);
  return row ?? null;
}

export async function createStore(db: DbOrTx, ownerId: string, input: { name: string; slug: string; defaultCurrency?: string }): Promise<StoreAccess> {
  const [row] = await db.insert(stores).values({ name: input.name, slug: input.slug, defaultCurrency: input.defaultCurrency ?? "EUR" }).returning({ id: stores.id, slug: stores.slug, name: stores.name });
  if (!row) throw new Error("store insert returned no row");
  await db.insert(storeMembers).values({ storeId: row.id, userId: ownerId, role: "owner" });
  return { ...row, role: "owner" };
}

// --- API keys for the public import API (EC-I2, I5) ---------------------------

export const API_KEY_PREFIX = "cf_live_";

export async function createApiKey(db: DbOrTx, storeId: string, name: string): Promise<{ id: string; key: string; prefix: string }> {
  const secret = randomToken(24);
  const key = `${API_KEY_PREFIX}${secret}`;
  const prefix = key.slice(0, 15);
  const [row] = await db.insert(apiKeys).values({ storeId, name, prefix, hash: sha256Hex(key) }).returning({ id: apiKeys.id });
  if (!row) throw new Error("api key insert returned no row");
  return { id: row.id, key, prefix };
}

export async function resolveApiKey(db: DbOrTx, bearer: string | null | undefined): Promise<{ storeId: string; keyId: string } | null> {
  if (!bearer || !bearer.startsWith(API_KEY_PREFIX)) return null;
  const [row] = await db.select({ id: apiKeys.id, storeId: apiKeys.storeId, revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.hash, sha256Hex(bearer))).limit(1);
  if (!row || row.revokedAt) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { storeId: row.storeId, keyId: row.id };
}
