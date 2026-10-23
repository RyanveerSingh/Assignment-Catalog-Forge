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
 */
export function CountrySwitcher({
  country,
  onChanged,
  className,
  locale = "en",
  names,
  language,
  showLabel = false,
}: {
  country: string | null;
  onChanged?: () => void;
  className?: string;
  locale?: string;
  names?: Record<string, string>;
  language?: string;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choices = country && !COUNTRY_CHOICES.some((c) => c.code === country) ? [{ code: country, name: country }, ...COUNTRY_CHOICES] : COUNTRY_CHOICES;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
        <Globe aria-hidden className="size-3.5 shrink-0" />
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
              "h-8 cursor-pointer appearance-none rounded-sm border border-border bg-card py-0 pl-2 pr-7 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60",
              showLabel && "border-transparent bg-transparent pl-0 font-medium",
            )}
          >
            <option value="">{t(locale, "detect")}</option>
            {choices.map((c) => (
              <option key={c.code} value={c.code}>
                {names?.[c.code] ?? c.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-ink-muted" />
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
