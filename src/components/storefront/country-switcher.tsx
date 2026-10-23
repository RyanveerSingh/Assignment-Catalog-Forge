"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { cn } from "cn";
import { COUNTRY_CHOICES } from "@/core/i18n/locale";
import { api } from "@/lib/client/api";
import { t } from "./i18n";

/**
 * Native select so it works at 375 px, with a keyboard and without any popover code.
 * Writes the `cf_country` cookie, then refreshes the page (or calls `onChanged`, e.g. to reload a preview iframe).
 * `names` lets the server pass localised country names; `language` renders the "· Deutsch" suffix of a ship-to line.
 * `tone="chrome"` inherits the header's colour, so the control is white over the hero and ink on the bar.
 */
export function CountrySwitcher({
  country,
  onChanged,
  className,
  locale = "en",
  names,
  language,
  showLabel = false,
  tone = "default",
}: {
  country: string | null;
  onChanged?: () => void;
  className?: string;
  locale?: string;
  names?: Record<string, string>;
  language?: string;
  showLabel?: boolean;
  tone?: "default" | "chrome";
}) {
  const router = useRouter();
  const [value, setValue] = useState(country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chrome = tone === "chrome";

  const choices = country && !COUNTRY_CHOICES.some((c) => c.code === country) ? [{ code: country, name: country }, ...COUNTRY_CHOICES] : COUNTRY_CHOICES;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className={cn("flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px]", chrome ? "text-current opacity-80 transition-opacity hover:opacity-100" : "text-ink-muted")}>
        <Globe aria-hidden className="size-3.5 shrink-0" strokeWidth={1.6} />
        <span className={showLabel ? "whitespace-nowrap" : "sr-only"}>{showLabel ? `${t(locale, "shipTo")}:` : t(locale, "country")}</span>
        <span className="relative inline-flex items-center">
          <select
            aria-label={t(locale, "country")}
            aria-busy={pending}
            value={value}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              setError(null);
              startTransition(async () => {
                try {
                  await api("/api/store-country", { method: "POST", json: { country: next } });
                  if (onChanged) onChanged();
                  else router.refresh();
                } catch {
                  setError(t(locale, "countryError"));
                  setValue(country ?? "");
                }
              });
            }}
            className={cn(
              "cursor-pointer appearance-none py-0 pr-7 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60",
              chrome ? "h-9 rounded-full border-0 bg-transparent pl-1 pr-6 font-medium text-current" : "h-8 rounded-sm border border-border bg-card pl-2 text-ink",
              !chrome && showLabel && "border-transparent bg-transparent pl-0 font-medium",
            )}
          >
            <option value="">{t(locale, "detect")}</option>
            {choices.map((c) => (
              <option key={c.code} value={c.code}>
                {names?.[c.code] ?? c.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className={cn("pointer-events-none absolute size-3.5", chrome ? "right-1" : "right-2 text-ink-muted")} />
        </span>
        {language ? <span className="whitespace-nowrap text-ink-muted">· {language}</span> : null}
      </label>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
