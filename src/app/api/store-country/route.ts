import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";

/**
 * Storefront country switcher: an explicit visitor choice stored for a year, which beats the geo
 * header on every later request (EC-H4). An empty country clears the cookie (back to auto-detect).
 */
const COOKIE = "cf_country";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let raw: unknown = url.searchParams.get("country");
  if (raw === null) {
    const body: unknown = await req.json().catch(() => null);
    raw = body && typeof body === "object" && "country" in body ? (body as { country?: unknown }).country : null;
  }
  const country = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (country && !/^[A-Z]{2}$/.test(country)) return apiError(400, "invalid_country", "Country must be a two-letter ISO code");

  const res = NextResponse.json({ ok: true, country: country || null }, { headers: { "Cache-Control": "no-store" } });
  if (country) res.cookies.set(COOKIE, country, { path: "/", sameSite: "lax", httpOnly: true, maxAge: ONE_YEAR });
  else res.cookies.set(COOKIE, "", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 0 });
  return res;
}
