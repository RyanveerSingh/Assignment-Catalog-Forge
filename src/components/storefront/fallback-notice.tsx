import { Languages } from "lucide-react";
import { cn } from "cn";

const LOCALE_NAMES: Record<string, string> = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch" };

export function localeName(locale: string): string {
  return LOCALE_NAMES[locale] ?? locale.toUpperCase();
}

/** Shown only when the current page fell back to English for at least one field (EC-H2). */
export function FallbackNotice({ locale, scope = "page", className }: { locale: string; scope?: "page" | "product"; className?: string }) {
  if (locale === "en") return null;
  return (
    <p role="note" className={cn("flex items-center gap-2 rounded-sm bg-paper-deep px-3 py-2 text-xs text-ink-muted", className)}>
      <Languages aria-hidden className="size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-ink">Shown in English.</span> {scope === "page" ? "Some items on this page" : "Part of this product"} are not yet translated into {localeName(locale)}.
      </span>
    </p>
  );
}
