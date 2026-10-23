/** Storefront URL builders; pure so client and server components can share them. */

export function storeHref(slug: string): string {
  return `/store/${encodeURIComponent(slug)}`;
}

export function categoryHref(slug: string, category: string): string {
  return `${storeHref(slug)}/c/${encodeURIComponent(category)}`;
}

export function productHref(slug: string, handle: string): string {
  return `${storeHref(slug)}/p/${encodeURIComponent(handle)}`;
}
