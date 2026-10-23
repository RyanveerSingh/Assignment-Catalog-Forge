import { Languages } from "lucide-react";
import { cn } from "cn";
import { nativeLocaleName, t } from "./i18n";

/** Shown only when the current page fell back to English for at least one field (EC-H2). */
export function FallbackNotice({ locale, scope = "page", className }: { locale: string; scope?: "page" | "product"; className?: string }) {
  if (locale === "en") return null;
  return (
    <p role="note" className={cn("flex items-center gap-2 rounded-sm bg-paper-deep px-3 py-2 text-xs text-ink-muted", className)}>
      <Languages aria-hidden className="size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-ink">{t(locale, "shownInEnglish")}</span> {t(locale, scope === "page" ? "fallbackPage" : "fallbackProduct", { language: nativeLocaleName(locale) })}
      </span>
    </p>
  );
}
