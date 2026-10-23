import { ImageOff } from "lucide-react";
import { cn } from "cn";

/** Quiet placeholder instead of a broken <img> when a product has no photo (EC-H8); names the category so the tile still says something. */
export function ImagePlaceholder({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="img" aria-label={label ?? "No image available"} className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-paper-deep px-4 text-center text-ink-muted", className)}>
      <ImageOff aria-hidden className="size-6" strokeWidth={1.4} />
      {label ? <span className="font-display text-base leading-tight">{label}</span> : null}
    </div>
  );
}
