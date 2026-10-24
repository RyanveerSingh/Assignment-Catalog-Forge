"use client";

/* eslint-disable @next/next/no-img-element -- blobs are served by our own route */
import { cn } from "cn";
import { Undo2Icon, XIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { settle, stagger } from "@/components/ext/motion";
import { TAP_TARGET } from "@/components/ext/surfaces";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import type { PickedProduct, TrayPhoto } from "./photo-tray-types";
import { ProductPicker } from "./product-picker";
import { imageUrl } from "./types";

/** One photo in the tray: a rounded card with the thumbnail, provenance, and the merchant's two choices. */
export function UnmatchedPhotoCard({ storeSlug, photo, index, busy, error, onAssign, onDismiss, onRestore }: { storeSlug: string; photo: TrayPhoto; index: number; busy: boolean; error: string | null; onAssign: (product: PickedProduct) => void; onDismiss: () => void; onRestore: () => void }) {
  const reduce = useReducedMotion();
  const dismissed = photo.status === "rejected";
  const uploaded = new Date(photo.createdAt);
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={settle(reduce, 0.3, stagger(index, 0.04))}
      className={cn("flex w-44 shrink-0 snap-start flex-col gap-2 rounded-2xl bg-card p-2 ring-1 ring-border transition-[opacity,transform] duration-200 hover:-translate-y-0.5", busy && "opacity-60")}
      aria-busy={busy}
      aria-label={photo.originalName}
    >
      <a href={imageUrl(storeSlug, photo.blobId)} target="_blank" rel="noreferrer" className="group relative block aspect-square cursor-pointer overflow-hidden rounded-xl bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${photo.originalName} full size`}>
        <img src={imageUrl(storeSlug, photo.thumbBlobId)} alt="" width={photo.width} height={photo.height} loading="lazy" className={cn("size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105", dismissed && "opacity-60 grayscale-[35%]")} />
        {dismissed ? <span className="absolute top-1.5 left-1.5 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted ring-1 ring-border">dismissed</span> : null}
      </a>
      <div className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-[12px] font-medium text-ink" title={photo.originalName}>
          {photo.originalName}
        </span>
        <span className="truncate text-[10px] text-ink-muted" title={photo.importName ?? undefined}>
          {photo.importName ?? "no import"} · <time dateTime={photo.createdAt} title={uploaded.toLocaleString("en-GB")}>{formatRelative(photo.createdAt)}</time>
        </span>
      </div>
      <div className="flex items-center gap-1">
        {dismissed ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRestore} className={cn("flex-1 cursor-pointer rounded-full", TAP_TARGET)}>
              <Undo2Icon data-icon="inline-start" />
              Restore
            </Button>
            <ProductPicker storeSlug={storeSlug} disabled={busy} onPick={onAssign} label="Assign to product" iconOnly />
          </>
        ) : (
          <>
            <ProductPicker storeSlug={storeSlug} disabled={busy} onPick={onAssign} className="flex-1 rounded-full" />
            <Button type="button" variant="ghost" size="icon-sm" disabled={busy} onClick={onDismiss} aria-label={`Dismiss ${photo.originalName}`} className={cn("cursor-pointer rounded-full text-ink-muted hover:text-destructive", "relative after:absolute after:-inset-2 after:content-['']")}>
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
    </motion.li>
  );
}
