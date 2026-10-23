/**
 * Merchant decisions about photos the matcher could not place (EC-C13): assign by hand, dismiss,
 * restore. Pure state transitions so the repository only has to load, apply and audit.
 */

export const DISMISS_REASON = "dismissed by merchant";
export const MANUAL_MATCH_METHOD = "manual";
export const MANUAL_MATCH_SCORE = 100;

export type PhotoStatus = "matched" | "unmatched" | "rejected";

export interface PhotoState {
  status: PhotoStatus;
  productId: string | null;
}

export interface ProductTarget {
  id: string;
  deletedAt: Date | null;
}

export interface AssignPatch {
  productId: string;
  variantId: null;
  position: number;
  matchMethod: typeof MANUAL_MATCH_METHOD;
  matchScore: typeof MANUAL_MATCH_SCORE;
  status: "matched";
  rejectReason: null;
}

export interface DismissPatch {
  status: "rejected";
  rejectReason: typeof DISMISS_REASON;
}

export interface RestorePatch {
  status: "unmatched";
  rejectReason: null;
}

export type PlanResult<P> = { ok: true; patch: P } | { ok: false; code: string; message: string };

/** A manual photo goes after everything the product already shows; gaps left by earlier matching are not reused. */
export function nextPhotoPosition(existingPositions: ReadonlyArray<number>): number {
  let max = -1;
  for (const p of existingPositions) if (Number.isFinite(p) && p > max) max = p;
  return max + 1;
}

export function planAssign(photo: PhotoState | null, product: ProductTarget | null, existingPositions: ReadonlyArray<number>): PlanResult<AssignPatch> {
  if (!photo) return { ok: false, code: "not_found", message: "Photo not found" };
  if (photo.status === "matched" && photo.productId) return { ok: false, code: "already_assigned", message: "This photo already belongs to a product" };
  if (!product) return { ok: false, code: "product_not_found", message: "Product not found" };
  if (product.deletedAt) return { ok: false, code: "product_deleted", message: "Restore the product before assigning photos to it" };
  return {
    ok: true,
    patch: {
      productId: product.id,
      variantId: null,
      position: nextPhotoPosition(existingPositions),
      matchMethod: MANUAL_MATCH_METHOD,
      matchScore: MANUAL_MATCH_SCORE,
      status: "matched",
      rejectReason: null,
    },
  };
}

export function planDismiss(photo: PhotoState | null): PlanResult<DismissPatch> {
  if (!photo) return { ok: false, code: "not_found", message: "Photo not found" };
  if (photo.status === "matched") return { ok: false, code: "already_assigned", message: "Assigned photos cannot be dismissed from here" };
  return { ok: true, patch: { status: "rejected", rejectReason: DISMISS_REASON } };
}

export function planRestore(photo: PhotoState | null): PlanResult<RestorePatch> {
  if (!photo) return { ok: false, code: "not_found", message: "Photo not found" };
  if (photo.status !== "rejected") return { ok: false, code: "not_dismissed", message: "Only dismissed photos can be restored" };
  return { ok: true, patch: { status: "unmatched", rejectReason: null } };
}
