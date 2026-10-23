/**
 * Wire shapes of the photos API as the browser sees them (JSON: dates are ISO strings).
 * Declared here, like ./types, so client bundles never import the database layer.
 */

export type TrayPhotoStatus = "unmatched" | "rejected";

export interface TrayPhoto {
  id: string;
  blobId: string;
  thumbBlobId: string;
  originalName: string;
  width: number;
  height: number;
  importId: string | null;
  importName: string | null;
  status: TrayPhotoStatus;
  rejectReason: string | null;
  createdAt: string;
}

export interface TrayPhotoListResponse {
  items: TrayPhoto[];
  total: number;
}

export type TrayPhotoAction = { action: "assign"; productId: string } | { action: "dismiss" } | { action: "restore" };

/** What the picker hands back: enough to name the product in the notice without another request. */
export interface PickedProduct {
  id: string;
  title: string | null;
  handle: string;
}

export const TRAY_PAGE_SIZE = 24;
