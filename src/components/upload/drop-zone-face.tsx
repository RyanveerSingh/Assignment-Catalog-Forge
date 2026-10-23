import { FolderOpenIcon } from "lucide-react";
import { cn } from "cn";
import { DropIllustration } from "./drop-illustration";

const FORMATS = ["CSV", "XLSX", "XLS", "SQL", "PNG", "JPG", "WEBP", "GIF", "ZIP"] as const;

/**
 * The face of the hero drop zone: the illustration on the left, the invitation, the formats and the
 * browse button on the right. `onBrowse` opens the file dialog; the zone itself only takes drops.
 */
export function DropZoneFace({ active, disabled, onBrowse }: { active: boolean; disabled: boolean; onBrowse: () => void }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] md:gap-12">
      <div className="mx-auto w-full max-w-[300px] px-2 py-3 md:px-0">
        <DropIllustration active={active} />
      </div>
      <div className="flex min-w-0 flex-col items-center gap-4 text-center md:items-start md:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
          <span aria-hidden className={cn("size-1.5 rounded-full bg-brand", active && "animate-pulse")} />
          {active ? "Release to add" : "Drop zone"}
        </span>
        <h2 className="font-display text-[1.75rem] leading-[1.05] text-ink md:text-[2.25rem]">{active ? "Let go. We will take it from here." : "Drop a supplier sheet and its photos."}</h2>
        <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
          One CSV, XLSX or XLS up to 50 MB, or a SQL dump (read, never executed). Photos as PNG, JPG, WEBP or GIF up to 25 MB each, or one ZIP up to 200 MB. Pasting works too. Parsing, cleaning, grouping and the AI writing run in the background while every row stays visible.
        </p>
        <ul aria-label="Accepted formats" className="flex flex-wrap justify-center gap-1.5 md:justify-start">
          {FORMATS.map((f) => (
            <li key={f} className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-ink-muted">
              {f}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={disabled}
          onClick={onBrowse}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-card px-5 text-[14px] font-medium text-ink ring-1 ring-border transition-[transform,background-color] duration-150 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderOpenIcon className="size-4 text-brand" aria-hidden />
          Browse files
        </button>
      </div>
    </div>
  );
}
