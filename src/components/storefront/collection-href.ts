/** URL builder shared by the server-rendered pagination and the client sort select; every collection state has a URL. */

export type StorefrontSort = "newest" | "price_asc" | "price_desc";

export const SORT_KEYS: readonly StorefrontSort[] = ["newest", "price_asc", "price_desc"];

export function buildCollectionHref(basePath: string, query: { category?: string; page?: number; sort?: StorefrontSort }): string {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
