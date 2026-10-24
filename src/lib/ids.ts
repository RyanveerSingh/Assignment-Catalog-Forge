import { HttpError } from "./http";

/**
 * Every id column is a Postgres `uuid`; a malformed value reaching a query fails the cast and would
 * surface as a 500. Route handlers check ids here first so a bad id is an ordinary 404 or 400.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** A path segment that names a resource: anything but a UUID cannot exist, so it is a 404. */
export function requireUuidParam(value: string, code: string, message: string): string {
  if (!isUuid(value)) throw new HttpError(404, code, message);
  return value;
}

/** An optional query parameter that must be a UUID when present: absent → undefined, malformed → 400. */
export function optionalUuidQuery(value: string | null, name: string): string | undefined {
  if (value === null || value === "") return undefined;
  if (!isUuid(value)) throw new HttpError(400, "invalid_id", `${name} must be a UUID`);
  return value;
}

/** Repeated query parameters (`?id=…&id=…`); one malformed value rejects the request. */
export function uuidQueryList(values: string[], name: string): string[] {
  const bad = values.find((v) => !isUuid(v));
  if (bad !== undefined) throw new HttpError(400, "invalid_id", `${name} must be a UUID`);
  return values;
}
