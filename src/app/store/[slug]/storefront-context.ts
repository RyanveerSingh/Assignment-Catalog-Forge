import { unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { SORT_KEYS, type StorefrontSort } from "@/components/storefront/collection-href";
import { resolveLocale } from "@/core/i18n/locale";
import { getStorefrontDb } from "@/db/client";
import type { CategoryPhoto } from "@/components/storefront/category-photos";
import { getStorefrontProduct, getStorefrontStore, getStorefrontVersion, listStorefrontCategories, listStorefrontCategoryPhotos, listStorefrontProducts, type StorefrontRow, type StorefrontStore } from "@/db/repositories/storefront";
import { singleFlight } from "@/lib/single-flight";

/**
 * Server-only helpers shared by every storefront page. Everything reads through the dedicated
 * storefront pool and sits behind a 30 s data cache so a running import never adds load (EC-H6).
 * The cache revalidates per request, so the loaders are also coalesced: fifty shoppers landing on a
 * stale page run one query, not fifty.
 *
 * Product caches are keyed on the catalogue's version as well, so anything published (by hand or by
 * an import's auto-publish, which runs in the worker where Next's revalidateTag is unavailable) shows
 * on the very next request instead of after the stale copy has been served out.
 */

export const PAGE_SIZE = 24;
const COUNTRY_COOKIE = "cf_country";
const REVALIDATE_SECONDS = 30;
/** How long one catalogue-version lookup is reused; under load that is one tiny query per store every 2 s. */
const VERSION_TTL_MS = 2_000;
const versions = new Map<string, { value: string; at: number }>();

async function catalogueVersion(storeId: string): Promise<string> {
  const hit = versions.get(storeId);
  if (hit && Date.now() - hit.at < VERSION_TTL_MS) return hit.value;
  const value = await singleFlight(`version:${storeId}`, () => getStorefrontVersion(getStorefrontDb(), storeId));
  versions.set(storeId, { value, at: Date.now() });
  return value;
}

/**
 * The published row minus the Date column: the data cache round-trips through JSON, so Dates would
 * silently become strings. `updatedAtMs` carries the same instant as a number for the "New" tag.
 */
export type StorefrontProduct = Omit<StorefrontRow, "updatedAt" | "storeId" | "locale"> & { updatedAtMs: number };

interface StorefrontContext {
  store: StorefrontStore;
  locale: string;
  country: string | null;
}

export function parseSort(value: string | undefined): StorefrontSort {
  return SORT_KEYS.find((k) => k === value) ?? "newest";
}

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function storeTag(storeId: string): string {
  return `storefront:${storeId}`;
}

export function cachedStore(slug: string): Promise<StorefrontStore | null> {
  return unstable_cache(() => singleFlight(`store:${slug}`, () => getStorefrontStore(getStorefrontDb(), slug)), ["storefront-store", slug], { revalidate: REVALIDATE_SECONDS, tags: ["storefront-stores"] })();
}

/** Cookie (explicit choice) beats the geo header (EC-H4); unmapped countries fall back to English (EC-H3). */
export async function loadStorefront(slug: string): Promise<StorefrontContext> {
  const store = await cachedStore(slug);
  if (!store) notFound();
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const cookieCountry = jar.get(COUNTRY_COOKIE)?.value || null;
  const geoCountry = hdrs.get("cf-ipcountry") ?? hdrs.get("x-vercel-ip-country") ?? hdrs.get("x-country");
  const resolved = resolveLocale({ country: cookieCountry ?? geoCountry, map: store.countryLocaleMap, available: store.locales });
  return { store, locale: resolved.locale, country: resolved.country };
}

/** A re-uploaded photo is recognised rather than stored twice, so a product can list one blob several times; show it once. */
function uniqueImages(images: StorefrontRow["images"]): StorefrontRow["images"] {
  const seen = new Set<string>();
  return images.filter((img) => {
    if (seen.has(img.id)) return false;
    seen.add(img.id);
    return true;
  });
}

function toProduct(row: StorefrontRow): StorefrontProduct {
  return {
    productId: row.productId,
    handle: row.handle,
    title: row.title,
    descriptionHtml: row.descriptionHtml,
    category: row.category,
    tags: row.tags,
    attributes: row.attributes,
    variants: row.variants,
    images: uniqueImages(row.images),
    priceFromCents: row.priceFromCents,
    currency: row.currency,
    seo: row.seo,
    fallbackFields: row.fallbackFields,
    updatedAtMs: row.updatedAt.getTime(),
  };
}

export async function cachedProducts(storeId: string, locale: string, opts: { category?: string; page: number; sort: StorefrontSort }): Promise<{ items: StorefrontProduct[]; total: number }> {
  const version = await catalogueVersion(storeId);
  const key = ["storefront-products", storeId, version, locale, opts.category ?? "", String(opts.page), opts.sort];
  return unstable_cache(
    () =>
      singleFlight(key.join("|"), async () => {
        const { items, total } = await listStorefrontProducts(getStorefrontDb(), storeId, locale, {
          category: opts.category,
          limit: PAGE_SIZE,
          offset: (opts.page - 1) * PAGE_SIZE,
          sort: opts.sort,
        });
        return { items: items.map(toProduct), total };
      }),
    key,
    { revalidate: REVALIDATE_SECONDS, tags: [storeTag(storeId)] },
  )();
}

export async function cachedProduct(storeId: string, locale: string, handle: string): Promise<StorefrontProduct | null> {
  const version = await catalogueVersion(storeId);
  const key = ["storefront-product", storeId, version, locale, handle];
  return unstable_cache(
    () =>
      singleFlight(key.join("|"), async () => {
        const row = await getStorefrontProduct(getStorefrontDb(), storeId, locale, handle);
        return row ? toProduct(row) : null;
      }),
    key,
    { revalidate: REVALIDATE_SECONDS, tags: [storeTag(storeId)] },
  )();
}

export async function cachedCategories(storeId: string, locale: string): Promise<Array<{ category: string; n: number }>> {
  const version = await catalogueVersion(storeId);
  const key = ["storefront-categories", storeId, version, locale];
  return unstable_cache(() => singleFlight(key.join("|"), () => listStorefrontCategories(getStorefrontDb(), storeId, locale)), key, {
    revalidate: REVALIDATE_SECONDS,
    tags: [storeTag(storeId)],
  })();
}

/** One photo per category path for tiles and menus; the same 30 s cache and tag as the categories themselves. */
export async function cachedCategoryPhotos(storeId: string, locale: string): Promise<CategoryPhoto[]> {
  const version = await catalogueVersion(storeId);
  const key = ["storefront-category-photos", storeId, version, locale];
  return unstable_cache(() => singleFlight(key.join("|"), () => listStorefrontCategoryPhotos(getStorefrontDb(), storeId, locale)), key, {
    revalidate: REVALIDATE_SECONDS,
    tags: [storeTag(storeId)],
  })();
}
