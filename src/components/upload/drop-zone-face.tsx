import { UploadIcon } from "lucide-react";
import { cn } from "cn";

const FORMATS = ["CSV", "XLSX", "XLS", "SQL", "PNG", "JPG", "WEBP", "GIF", "ZIP"] as const;

/**
 * Sheet → arrow → product card, drawn in ink with the arrow as the one amber mark. While a file is
 * held over the zone the arrow nudges forward and the card lifts: transforms only, so nothing reflows.
 */
function DropIllustration({ active, className }: { active: boolean; className?: string }) {
  const ink = "stroke-ink";
  const faint = "stroke-ink/45";
  return (
    <svg viewBox="0 0 220 120" className={cn("h-auto overflow-visible", className)} aria-hidden fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* the supplier sheet */}
      <g className="transition-transform duration-300 ease-out">
        <rect x="6" y="14" width="70" height="92" rx="3" className={cn(ink, "fill-card")} />
        <line x1="6" y1="28" x2="76" y2="28" className={ink} />
        <line x1="12" y1="21" x2="26" y2="21" className={ink} strokeWidth={2.5} />
        <line x1="32" y1="21" x2="48" y2="21" className={ink} strokeWidth={2.5} />
        <line x1="54" y1="21" x2="68" y2="21" className={ink} strokeWidth={2.5} />
        <line x1="12" y1="39" x2="38" y2="39" className={faint} />
        <line x1="46" y1="39" x2="68" y2="39" className={faint} />
        <line x1="12" y1="49" x2="32" y2="49" className={faint} />
        <line x1="46" y1="49" x2="60" y2="49" className={faint} />
        <line x1="12" y1="59" x2="40" y2="59" className={faint} />
        <path d="M46 59 q3 -4 6 0 t6 0 t6 0 t6 0" className={ink} />
        <line x1="12" y1="69" x2="28" y2="69" className={faint} />
        <path d="M48 66 l6 6 M54 66 l-6 6" className={ink} />
        <line x1="12" y1="79" x2="36" y2="79" className={faint} />
        <line x1="46" y1="79" x2="70" y2="79" className={faint} />
        <line x1="12" y1="89" x2="42" y2="89" className={faint} />
        <line x1="12" y1="99" x2="30" y2="99" className={faint} />
        <line x1="46" y1="99" x2="62" y2="99" className={faint} />
      </g>
      {/* the forge: the one amber mark */}
      <g className={cn("stroke-brand transition-transform duration-300 ease-out", active ? "translate-x-1.5" : "group-hover:translate-x-1")} strokeWidth={2}>
        <path d="M88 60 H126" />
        <path d="M119 53 L127 60 L119 67" />
        <path d="M104 44 v8 M100 48 h8" strokeWidth={1.5} />
      </g>
      {/* the finished product card */}
      <g className={cn("transition-transform duration-300 ease-out", active ? "-translate-y-1" : "group-hover:-translate-y-0.5")}>
        <rect x="140" y="10" width="74" height="100" rx="4" className={cn(ink, "fill-card")} />
        <rect x="147" y="17" width="60" height="42" rx="2" className={cn(faint, "fill-paper-deep")} />
        <path d="M150 56 l14 -15 l9 9 l7 -7 l15 13" className={ink} />
        <circle cx="195" cy="27" r="3.5" className={ink} />
        <rect x="147" y="67" width="44" height="4" rx="2" className="fill-ink" />
        <line x1="147" y1="79" x2="207" y2="79" className={faint} />
        <line x1="147" y1="86" x2="199" y2="86" className={faint} />
        <line x1="147" y1="93" x2="183" y2="93" className={faint} />
        <rect x="147" y="100" width="22" height="6" rx="1" className={ink} />
        <circle cx="202" cy="102" r="6" className={cn(ink, "fill-card")} />
        <path d="M199 102 l2 2 l4 -4" className={ink} />
      </g>
    </svg>
  );
}

/** The contents of the drop target: illustration on the left, the invitation and the accepted formats on the right. */
export function DropZoneFace({ active }: { active: boolean }) {
  return (
    <>
      <DropIllustration active={active} className="w-[180px] shrink-0 md:w-[220px]" />
      <div className="flex min-w-0 flex-col items-center gap-2 md:items-start">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
          <UploadIcon className="size-3.5" aria-hidden />
          Drop zone
        </span>
        <p className="font-display text-xl leading-tight text-ink md:text-2xl">{active ? "Release to add the files" : "Drop a supplier sheet and photos here"}</p>
        <p className="max-w-lg text-xs leading-relaxed text-ink-muted">
          Or click to browse. One CSV, XLSX or XLS up to 50 MB, or a SQL dump (.sql from mysqldump / pg_dump; read, never executed). Photos as PNG, JPG, WEBP or GIF up to 25 MB each, or one ZIP up to 200 MB. Pasting files works too.
        </p>
        <ul aria-label="Accepted formats" className="flex flex-wrap justify-center gap-1 md:justify-start">
          {FORMATS.map((f) => (
            <li key={f} className="rounded-sm bg-paper-deep px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-ink-muted">
              {f}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
