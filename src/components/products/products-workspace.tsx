"use client";

import { useState } from "react";
import { ProductsTable } from "./products-table";
import { StatusStrip } from "./status-strip";
import type { ProductStatusCounts } from "./types";
import { UnmatchedPhotos } from "./unmatched-photos";

/**
 * The status strip and photo tray above the table. The strip's counts come with the page and are
 * refreshed by every table fetch, so an approval moves the bar. Assigning a photo changes a row's
 * thumbnail and photo count, and the table owns its own fetch, so a fresh key remounts it; filters
 * live in the URL and survive the remount.
 */
export function ProductsWorkspace({ storeSlug, initialImportId, initialStatusCounts }: { storeSlug: string; initialImportId: string; initialStatusCounts: ProductStatusCounts }) {
  const [tableKey, setTableKey] = useState(0);
  const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
  return (
    <>
      <StatusStrip counts={statusCounts} />
      <UnmatchedPhotos storeSlug={storeSlug} onAssigned={() => setTableKey((k) => k + 1)} />
      <ProductsTable key={tableKey} storeSlug={storeSlug} initialImportId={initialImportId} onStatusCounts={setStatusCounts} />
    </>
  );
}
