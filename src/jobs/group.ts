import { eq } from "drizzle-orm";
import { routeTier } from "@/core/ai/routing";
import { groupRows } from "@/core/group/group";
import { appendImportEvent, getImportById, recomputeImportCounts, updateImport } from "@/db/repositories/imports";
import { listPhotosForImport } from "@/db/repositories/photos";
import { assignAiBatchKeys, upsertProductFromGroup } from "@/db/repositories/products";
import { assignRowsToProduct, getAllCleanedRows, markDuplicateRows, setRowsStatusForProduct } from "@/db/repositories/rows";
import { products, stores } from "@/db/schema";
import { stableHash } from "@/lib/crypto";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { rematchPhotos } from "./photos";

export const AI_BATCH_SIZE = 8;

/**
 * Stage 3: group cleaned rows into products and variants, upsert them (no duplicates by
 * construction), close out duplicate rows, route each product to a model tier and assign stable
 * AI batch keys. Unchanged products on a re-upload skip the AI entirely (EC-C10, D20).
 */
export const groupHandler: JobHandler = async ({ job, db, log, signal }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("group job without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp) return;
  if (imp.status !== "grouping" && imp.status !== "enriching") {
    log.info({ status: imp.status }, "group skipped");
    return;
  }
  const [store] = await db.select({ defaultCurrency: stores.defaultCurrency }).from(stores).where(eq(stores.id, imp.storeId)).limit(1);
  const rows = await getAllCleanedRows(db, importId);
  if (rows.length === 0) {
    await driveImport(db, importId);
    return;
  }

  const result = groupRows(
    rows.map((r) => r.cleaned),
    { storeDefaultCurrency: store?.defaultCurrency ?? "EUR" },
  );
  const photoCount = (await listPhotosForImport(db, importId)).length;
  const productIdByRow = new Map<number, string>();
  let created = 0;
  let unchanged = 0;
  let pending = 0;

  for (const group of result.groups) {
    if (signal.aborted) throw new JobError("lease lost while grouping", { retryable: true, retryAfterMs: 0 });
    // The model reads every source cell, so any cell change must invalidate the AI result, not just
    // changes to the product-level fields the grouping hash covers (EC-C10, D20).
    group.sourceHash = stableHash({ base: group.sourceHash, corpus: group.sourceCorpus });
    const outcome = await db.transaction(async (tx) => {
      const up = await upsertProductFromGroup(tx, imp.storeId, importId, group);
      await assignRowsToProduct(tx, importId, group.sourceRows, up.productId, group.productKey);
      for (const r of group.sourceRows) productIdByRow.set(r, up.productId);
      const reusable = !up.sourceChanged && up.previousStatus && up.previousStatus !== "pending_ai" && up.previousStatus !== "failed";
      if (reusable) {
        await setRowsStatusForProduct(tx, up.productId, up.previousStatus === "needs_review" ? "needs_review" : "done");
        return "unchanged" as const;
      }
      const tier = routeTier(group, photoCount > 0 ? group.images.length || 1 : 0).tier;
      // A fresh batch key per import: a product carried over from an earlier upload must not reuse that upload's job key.
      await tx.update(products).set({ aiTier: tier, aiBatchKey: null, status: "pending_ai", updatedAt: new Date() }).where(eq(products.id, up.productId));
      return up.created ? ("created" as const) : ("pending" as const);
    });
    if (outcome === "created") created += 1;
    else if (outcome === "unchanged") unchanged += 1;
    else pending += 1;
  }

  await markDuplicateRows(db, importId, result.duplicateRows, productIdByRow);
  await assignAiBatchKeys(db, importId, AI_BATCH_SIZE, (p) => (p.group ? routeTier(p.group, 0).tier : "cheap"));
  await updateImport(db, importId, { productCount: result.groups.length });
  await rematchPhotos(db, imp.storeId, importId);
  await recomputeImportCounts(db, importId);

  const conflicts = result.groups.filter((g) => g.conflicts.length > 0).length;
  await appendImportEvent(db, importId, "info", `Grouped ${rows.length} rows into ${result.groups.length} products (${result.duplicateRows.length} duplicate rows, ${conflicts} with conflicts)`, {
    created,
    updated: pending,
    unchanged,
    duplicates: result.duplicateRows.length,
    conflicts,
  });
  log.info({ products: result.groups.length, created, pending, unchanged }, "grouped");
  await driveImport(db, importId);
};
