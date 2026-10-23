"use client";

import { useState } from "react";
import { ProductsTable } from "./products-table";
import { UnmatchedPhotos } from "./unmatched-photos";

/**
 * The photo tray above the table. Assigning a photo changes a row's thumbnail and photo count, and the
 * table owns its own fetch, so a fresh key remounts it; filters live in the URL and survive the remount.
 */
export function ProductsWorkspace({ storeSlug, initialImportId }: { storeSlug: string; initialImportId: string }) {
  const [tableKey, setTableKey] = useState(0);
  return (
    <>
      <UnmatchedPhotos storeSlug={storeSlug} onAssigned={() => setTableKey((k) => k + 1)} />
      <ProductsTable key={tableKey} storeSlug={storeSlug} initialImportId={initialImportId} />
    </>
  );
}
