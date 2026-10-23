const inflight = new Map<string, Promise<unknown>>();

/**
 * Collapses concurrent calls with the same key into one invocation. The storefront's cache
 * revalidates per request, so fifty shoppers hitting a stale page would otherwise fire fifty
 * identical queries at a four-connection pool (EC-H6).
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = fn().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

/** Number of keys currently in flight; exposed for tests and the health endpoint. */
export function inflightCount(): number {
  return inflight.size;
}
