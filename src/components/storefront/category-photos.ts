/**
 * One photo per category path, taken from the newest photographed product in it. The lookup is a
 * prefix match like the category filter itself, so a family or a middle level borrows the newest
 * photo from anywhere beneath it.
 */

export interface CategoryPhoto {
  category: string;
  imageId: string;
  thumbId: string;
  alt: string;
  updatedAtMs: number;
}

export function pickCategoryPhoto(photos: CategoryPhoto[], path: string): CategoryPhoto | null {
  let best: CategoryPhoto | null = null;
  for (const photo of photos) {
    if (photo.category !== path && !photo.category.startsWith(`${path} > `)) continue;
    if (!best || photo.updatedAtMs > best.updatedAtMs) best = photo;
  }
  return best;
}
