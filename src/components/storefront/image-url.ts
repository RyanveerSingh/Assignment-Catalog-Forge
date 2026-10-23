/** Public image route; blob ids are UUIDs scoped to the store, served as pre-resized WebP (800 px main, 400 px thumb). */
export function storefrontImageUrl(storeSlug: string, blobId: string): string {
  return `/api/img/${encodeURIComponent(storeSlug)}/${encodeURIComponent(blobId)}`;
}
