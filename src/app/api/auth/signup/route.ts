import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { slugify } from "@/core/clean/row";
import { getDb } from "@/db/client";
import { stores, users } from "@/db/schema";
import { createSession, createStore, registerUser, SESSION_COOKIE } from "@/lib/auth";
import { apiError, json, withApi } from "@/lib/http";
import { clientIp, createRateLimiter, formatRetryAfter } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  storeName: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(1_000),
});

// Each account can start imports on the operator's AI key, so one address cannot mint accounts in bulk.
const signups = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

const UNIQUE_VIOLATION = "23505";

/** Drizzle wraps driver errors, so the Postgres code can sit on the error or on its cause. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; typeof e === "object" && e !== null && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if ("code" in e && e.code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

async function freeSlug(storeName: string): Promise<string> {
  const base = slugify(storeName).slice(0, 40).replace(/-+$/, "") || "store";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const [taken] = await getDb().select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export const POST = withApi(async (req: Request) => {
  // Same CSRF rule as login: a cross-site form cannot send a JSON body.
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return apiError(415, "unsupported_media_type", "Send the details as JSON (Content-Type: application/json)");
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", "Name, store name, a valid email and a password of at least 8 characters are required");
  const { name, storeName, email, password } = parsed.data;

  const decision = signups.consume(clientIp(req.headers));
  if (!decision.allowed) {
    const res = apiError(429, "too_many_signups", `Too many new accounts from this address. Try again in ${formatRetryAfter(decision.retryAfterMs)}.`);
    res.headers.set("Retry-After", String(Math.ceil(decision.retryAfterMs / 1000)));
    return res;
  }

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing) return apiError(409, "email_taken", "An account with this email already exists. Sign in instead.");

  const slug = await freeSlug(storeName);
  let user;
  try {
    user = await db.transaction(async (tx) => {
      const created = await registerUser(tx, { email, password, name });
      await createStore(tx, created.id, { name: storeName, slug });
      return created;
    });
  } catch (err) {
    // Two sign-ups racing for the same email or slug: the unique index decides, the loser gets a clear answer.
    if (isUniqueViolation(err)) {
      return apiError(409, "email_taken", "An account with this email already exists. Sign in instead.");
    }
    throw err;
  }

  const session = await createSession(db, user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  return json({ user, store: { slug } }, { status: 201 });
});
