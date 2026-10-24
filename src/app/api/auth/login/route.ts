import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { authenticate, createSession, SESSION_COOKIE } from "@/lib/auth";
import { apiError, json, withApi } from "@/lib/http";
import { loginThrottle } from "@/lib/login-throttle";
import { clientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ email: z.string().min(3).max(320), password: z.string().min(1).max(1_000) });

export const POST = withApi(async (req: Request) => {
  // A cross-site form can only send urlencoded, multipart or text/plain bodies; requiring JSON stops login CSRF.
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return apiError(415, "unsupported_media_type", "Send the credentials as JSON (Content-Type: application/json)");
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", "Email and password are required");
  const { email, password } = parsed.data;
  const ip = clientIp(req.headers);
  const blocked = loginThrottle.blocked(email, ip);
  if (blocked) {
    const res = apiError(429, "too_many_attempts", blocked.message);
    res.headers.set("Retry-After", String(Math.ceil(blocked.retryAfterMs / 1000)));
    return res;
  }
  const user = await authenticate(getDb(), email, password);
  if (!user) {
    loginThrottle.recordFailure(email, ip);
    return apiError(401, "invalid_credentials", "Email or password is wrong");
  }
  loginThrottle.recordSuccess(email, ip);
  const session = await createSession(getDb(), user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  return json({ user });
});
