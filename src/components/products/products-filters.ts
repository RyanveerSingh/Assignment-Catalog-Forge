import { PRODUCT_STATUSES, type ProductSortKey, type ProductStatus } from "./types";

/** Table state that lives in the URL so a reload, a shared link or the back button restores the same view. */
export interface ProductFilters {
  q: string;
  status: ProductStatus[];
  importId: string;
  category: string;
  minConfidence: number | null;
  maxConfidence: number | null;
  hasPhotos: boolean | null;
  outdated: boolean;
  missing: boolean;
  deleted: boolean;
  sort: ProductSortKey;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;
const SORT_KEYS: ReadonlyArray<ProductSortKey> = ["updatedAt", "title", "status", "confidence", "price", "createdAt"];

export const DEFAULT_FILTERS: ProductFilters = {
  q: "",
  status: [],
  importId: "",
  category: "",
  minConfidence: null,
  maxConfidence: null,
  hasPhotos: null,
  outdated: false,
  missing: false,
  deleted: false,
  sort: "updatedAt",
  dir: "desc",
  limit: 25,
  offset: 0,
};

function intOrNull(v: string | null, min: number, max: number): number | null {
  if (v === null || v === "") return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function parseFilters(sp: URLSearchParams, fallbackImportId = ""): ProductFilters {
  const sort = sp.get("sort");
  const limit = intOrNull(sp.get("limit"), 1, 100) ?? DEFAULT_FILTERS.limit;
  return {
    q: sp.get("q") ?? "",
    status: sp.getAll("status").filter((s): s is ProductStatus => (PRODUCT_STATUSES as ReadonlyArray<string>).includes(s)),
    importId: sp.get("importId") ?? fallbackImportId,
    category: sp.get("category") ?? "",
    minConfidence: intOrNull(sp.get("minConfidence"), 0, 100),
    maxConfidence: intOrNull(sp.get("maxConfidence"), 0, 100),
    hasPhotos: sp.get("hasPhotos") === "true" ? true : sp.get("hasPhotos") === "false" ? false : null,
    outdated: sp.get("outdated") === "true",
    missing: sp.get("missing") === "true",
    deleted: sp.get("deleted") === "true",
    sort: SORT_KEYS.includes(sort as ProductSortKey) ? (sort as ProductSortKey) : DEFAULT_FILTERS.sort,
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
    limit: (PAGE_SIZES as ReadonlyArray<number>).includes(limit) ? limit : DEFAULT_FILTERS.limit,
    offset: intOrNull(sp.get("offset"), 0, 1_000_000) ?? 0,
  };
}

/** Only non-default values are written, so the address bar stays short and the default view has no query string. */
export function toSearchParams(f: ProductFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  for (const s of f.status) sp.append("status", s);
  if (f.importId) sp.set("importId", f.importId);
  if (f.category) sp.set("category", f.category);
  if (f.minConfidence !== null) sp.set("minConfidence", String(f.minConfidence));
  if (f.maxConfidence !== null) sp.set("maxConfidence", String(f.maxConfidence));
  if (f.hasPhotos !== null) sp.set("hasPhotos", String(f.hasPhotos));
  if (f.outdated) sp.set("outdated", "true");
  if (f.missing) sp.set("missing", "true");
  if (f.deleted) sp.set("deleted", "true");
  if (f.sort !== DEFAULT_FILTERS.sort) sp.set("sort", f.sort);
  if (f.dir !== DEFAULT_FILTERS.dir) sp.set("dir", f.dir);
  if (f.limit !== DEFAULT_FILTERS.limit) sp.set("limit", String(f.limit));
  if (f.offset) sp.set("offset", String(f.offset));
  return sp;
}

/** The list endpoint's query string: same names as the URL plus paging and the category list. */
export function toApiQuery(f: ProductFilters, withCategories: boolean): string {
  const sp = toSearchParams(f);
  sp.set("sort", f.sort);
  sp.set("dir", f.dir);
  sp.set("limit", String(f.limit));
  sp.set("offset", String(f.offset));
  if (withCategories) sp.set("withCategories", "true");
  return sp.toString();
}

/** The export route only understands status and importId; everything else is a view concern. */
export function toExportQuery(f: ProductFilters, format: "csv" | "json" | "shopify"): string {
  const sp = new URLSearchParams();
  sp.set("format", format);
  for (const s of f.status) sp.append("status", s);
  if (f.importId) sp.set("importId", f.importId);
  return sp.toString();
}

const PAGING_KEYS: ReadonlyArray<keyof ProductFilters> = ["offset", "limit", "sort", "dir"];

/** Changing any filter (not paging/sorting) jumps back to the first page so the result is never an empty tail. */
export function applyFilterPatch(current: ProductFilters, patch: Partial<ProductFilters>): ProductFilters {
  const next = { ...current, ...patch };
  const touchedFilter = (Object.keys(patch) as Array<keyof ProductFilters>).some((k) => !PAGING_KEYS.includes(k));
  if (touchedFilter || (patch.limit !== undefined && patch.limit !== current.limit)) next.offset = 0;
  return next;
}

export function countActiveFilters(f: ProductFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.status.length) n++;
  if (f.importId) n++;
  if (f.category) n++;
  if (f.minConfidence !== null || f.maxConfidence !== null) n++;
  if (f.hasPhotos !== null) n++;
  if (f.outdated) n++;
  if (f.missing) n++;
  if (f.deleted) n++;
  return n;
}
