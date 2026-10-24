"use client";

/* eslint-disable @next/next/no-img-element -- blobs are served by our own route; next/image adds nothing here */
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { matchBadge, type MatchTone } from "./photo-match-label";
import { imageUrl, type PhotoRow } from "./types";

const TONE_CLASS: Record<MatchTone, string> = {
  neutral: "bg-muted text-ink-muted ring-border",
  brand: "bg-brand-soft text-brand ring-brand/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
};

/** The chip on each photo: method in words plus the score, so a weak fuzzy match or a manual pick is visible at a glance. */
function PhotoMatchBadge({ photo }: { photo: Pick<PhotoRow, "originalName" | "matchMethod" | "matchScore"> }) {
  const badge = matchBadge(photo.matchMethod, photo.matchScore);
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className={cn("inline-flex h-5 max-w-full cursor-default items-center gap-1 truncate rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-brand", TONE_CLASS[badge.tone])} />}>
        <span className="truncate num">{badge.label}</span>
        <span className="sr-only">
          , {photo.originalName}, {badge.description}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <span className="flex flex-col gap-0.5">
          <span className="num break-all">{photo.originalName}</span>
          <span className="text-background/80">{badge.description}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Matched photos with the method that matched them, so a wrong fuzzy match is visible at a glance. */
export function PhotoGrid({ storeSlug, photos }: { storeSlug: string; photos: PhotoRow[] }) {
  if (photos.length === 0) return <p className="text-xs text-ink-muted">No photos matched.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        <li key={p.id} className="flex min-w-0 flex-col gap-1">
          <a href={imageUrl(storeSlug, p.blobId)} target="_blank" rel="noreferrer" className="block aspect-square cursor-pointer overflow-hidden border border-border bg-paper-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${p.originalName} full size`}>
            <img src={imageUrl(storeSlug, p.thumbBlobId)} alt={p.originalName} width={p.width} height={p.height} loading="lazy" className="size-full object-cover" />
          </a>
          <div className="truncate text-[11px] text-ink" title={p.originalName}>
            {p.originalName}
          </div>
          <PhotoMatchBadge photo={p} />
        </li>
      ))}
    </ul>
  );
}
