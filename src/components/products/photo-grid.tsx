"use client";

/* eslint-disable @next/next/no-img-element -- blobs are served by our own route; next/image adds nothing here */
import { imageUrl, type PhotoRow } from "./types";

/** Matched photos with the method that matched them, so a wrong fuzzy match is visible at a glance. */
export function PhotoGrid({ storeSlug, photos }: { storeSlug: string; photos: PhotoRow[] }) {
  if (photos.length === 0) return <p className="text-xs text-ink-muted">No photos matched.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        <li key={p.id} className="flex flex-col gap-1">
          <a href={imageUrl(storeSlug, p.blobId)} target="_blank" rel="noreferrer" className="block aspect-square cursor-pointer overflow-hidden border border-border bg-paper-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${p.originalName} full size`}>
            <img src={imageUrl(storeSlug, p.thumbBlobId)} alt={p.originalName} width={p.width} height={p.height} loading="lazy" className="size-full object-cover" />
          </a>
          <div className="truncate text-[11px] text-ink" title={p.originalName}>
            {p.originalName}
          </div>
          <div className="num text-[10px] text-ink-muted">
            {p.matchMethod.replace(/_/g, " ")} · {p.matchScore}
          </div>
        </li>
      ))}
    </ul>
  );
}
