import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { json, withApi } from "@/lib/http";

export const POST = withApi(async () => {
  const jar = await cookies();
  await destroySession(getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return json({ ok: true });
});
