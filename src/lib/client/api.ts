"use client";

/** Thin fetch wrapper for client components: JSON in/out, typed errors, never swallows failures. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(input: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json: body, headers, ...rest } = init;
  const res = await fetch(input, {
    ...rest,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : rest.body,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export function storeApi(slug: string): string {
  return `/api/stores/${encodeURIComponent(slug)}`;
}
