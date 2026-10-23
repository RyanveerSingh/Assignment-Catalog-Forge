import { cn } from "cn";
import type { ColourSwatch } from "./colour-names";
import { t } from "./i18n";

/** Small dots for the colours a product comes in; the name sits in `title` and in screen-reader text, the dot is only a hint. */
export function ColourSwatches({ swatches, more, locale, className }: { swatches: ColourSwatch[]; more: number; locale: string; className?: string }) {
  if (swatches.length === 0) return null;
  return (
    <ul aria-label={t(locale, "coloursLabel")} className={cn("flex items-center gap-1.5", className)}>
      {swatches.map((s) => (
        <li key={s.name} title={s.name} className={cn("size-3.5 rounded-full ring-1 ring-inset", s.css ? "ring-ink/15" : "bg-paper ring-ink-muted/70")} style={s.css ? { backgroundColor: s.css } : undefined}>
          <span className="sr-only">{t(locale, "colourSwatch", { name: s.name })}</span>
        </li>
      ))}
      {more > 0 ? <li className="num text-[11px] leading-none text-ink-muted">+{more}</li> : null}
    </ul>
  );
}
