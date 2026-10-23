"use client";

/* eslint-disable @next/next/no-img-element -- blobs are served by our own route */
import { cn } from "cn";
import { Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { PickedProduct, TrayPhoto } from "./photo-tray-types";
import { ProductPicker, TAP_TARGET } from "./product-picker";
import { imageUrl } from "./types";

/** One photo in the tray: thumbnail, provenance, and the merchant's two choices. */
export function UnmatchedPhotoCard({ storeSlug, photo, busy, error, onAssign, onDismiss, onRestore }: { storeSlug: string; photo: TrayPhoto; busy: boolean; error: string | null; onAssign: (product: PickedProduct) => void; onDismiss: () => void; onRestore: () => void }) {
  const dismissed = photo.status === "rejected";
  const uploaded = new Date(photo.createdAt);
  return (
    <li className={cn("flex w-40 shrink-0 flex-col gap-1.5 border border-border bg-card p-1.5 transition-opacity", busy && "opacity-60")} aria-busy={busy} aria-label={photo.originalName}>
      <a href={imageUrl(storeSlug, photo.blobId)} target="_blank" rel="noreferrer" className="relative block aspect-square cursor-pointer overflow-hidden border border-border bg-paper-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${photo.originalName} full size`}>
        <img src={imageUrl(storeSlug, photo.thumbBlobId)} alt="" width={photo.width} height={photo.height} loading="lazy" className={cn("size-full object-cover", dismissed && "opacity-60 grayscale-[35%]")} />
        {dismissed ? <span className="absolute top-1 left-1 bg-muted px-1 text-[10px] uppercase tracking-wide text-ink-muted ring-1 ring-inset ring-border">dismissed</span> : null}
      </a>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] text-ink" title={photo.originalName}>
          {photo.originalName}
        </span>
        <span className="truncate text-[10px] text-ink-muted" title={photo.importName ?? undefined}>
          {photo.importName ?? "no import"}
        </span>
        <time dateTime={photo.createdAt} title={uploaded.toLocaleString("en-GB")} className="num text-[10px] text-ink-muted">
          {formatRelative(photo.createdAt)}
        </time>
      </div>
      <div className="flex items-center gap-1">
        {dismissed ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRestore} className={cn("flex-1 cursor-pointer", TAP_TARGET)}>
              <Undo2Icon data-icon="inline-start" />
              Restore
            </Button>
            <ProductPicker storeSlug={storeSlug} disabled={busy} onPick={onAssign} label="Assign to product" iconOnly />
          </>
        ) : (
          <>
            <ProductPicker storeSlug={storeSlug} disabled={busy} onPick={onAssign} className="flex-1" />
            <Button type="button" variant="ghost" size="icon-sm" disabled={busy} onClick={onDismiss} aria-label={`Dismiss ${photo.originalName}`} className={cn("cursor-pointer text-ink-muted hover:text-destructive", "relative after:absolute after:-inset-2 after:content-['']")}>
              <XIcon />
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-[10px] leading-tight text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}
