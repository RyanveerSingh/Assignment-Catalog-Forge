import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { getSessionUser, getUserStore, listUserStores, resolveApiKey, SESSION_COOKIE, type SessionUser, type StoreAccess } from "./auth";
import { HttpError } from "./http";

export interface RequestContext {
  user: SessionUser;
  store: StoreAccess;
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return getSessionUser(getDb(), jar.get(SESSION_COOKIE)?.value);
}

/** For route handlers: resolve the signed-in user and verify membership of the store in the URL (EC-I1). */
export async function requireStore(storeSlug: string): Promise<RequestContext> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  const store = await getUserStore(getDb(), user.id, storeSlug);
  if (!store) throw new HttpError(404, "store_not_found", "Store not found");
  return { user, store };
}

/** For pages: null instead of throwing, so the page can redirect. */
export async function optionalStore(storeSlug: string): Promise<RequestContext | null> {
  const user = await currentUser();
  if (!user) return null;
  const store = await getUserStore(getDb(), user.id, storeSlug);
  return store ? { user, store } : null;
}

export async function userStores(userId: string): Promise<StoreAccess[]> {
  return listUserStores(getDb(), userId);
}

/** Public API: Bearer key → store. */
export async function requireApiKeyStore(req: Request): Promise<{ storeId: string }> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const resolved = await resolveApiKey(getDb(), bearer);
  if (!resolved) throw new HttpError(401, "invalid_api_key", "Missing or invalid API key");
  return { storeId: resolved.storeId };
}
