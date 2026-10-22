import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { authenticate, createSession, SESSION_COOKIE } from "@/lib/auth";
import { apiError, json, withApi } from "@/lib/http";

const bodySchema = z.object({ email: z.string().min(3), password: z.string().min(1) });

export const POST = withApi(async (req: Request) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", "Email and password are required");
  const user = await authenticate(getDb(), parsed.data.email, parsed.data.password);
  if (!user) return apiError(401, "invalid_credentials", "Email or password is wrong");
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
