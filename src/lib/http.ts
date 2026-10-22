import { NextResponse } from "next/server";

export function json<T>(data: T, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } });
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function apiError(status: number, code: string, message: string, details?: unknown): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Thrown inside route handlers to short-circuit with a response; caught by `withApi`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function parseIntParam(value: string | null, fallback: number, min = 0, max = 10_000): number {
  const n = value === null ? NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Wrap a handler so thrown HttpErrors become JSON responses and anything else a 500 without a stack trace (EC-E4). */
export function withApi<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return apiError(err.status, err.code, err.message, err.details);
      const { getLogger } = await import("./logger");
      getLogger({ component: "api" }).error({ err }, "unhandled API error");
      const dbDown = err instanceof Error && /ECONNREFUSED|connection|terminated|timeout/i.test(err.message);
      return apiError(dbDown ? 503 : 500, dbDown ? "unavailable" : "internal", dbDown ? "The database is temporarily unavailable; please retry" : "Something went wrong");
    }
  };
}
