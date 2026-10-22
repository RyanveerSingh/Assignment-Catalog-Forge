"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { cn } from "cn";
import { COUNTRY_CHOICES } from "@/core/i18n/locale";
import { api } from "@/lib/client/api";

/**
 * Native select so it works at 375 px, with a keyboard and without any popover code.
 * Writes the `cf_country` cookie, then refreshes the page (or calls `onChanged`, e.g. to reload a preview iframe).
 */
export function CountrySwitcher({ country, onChanged, className }: { country: string | null; onChanged?: () => void; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choices = country && !COUNTRY_CHOICES.some((c) => c.code === country) ? [{ code: country, name: country }, ...COUNTRY_CHOICES] : COUNTRY_CHOICES;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Globe aria-hidden className="size-3.5" />
        <span className="sr-only">Country</span>
        <select
          aria-label="Country"
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
                setError("Could not change country");
                setValue(country ?? "");
              }
            });
          }}
          className="h-8 cursor-pointer rounded-sm border border-border bg-card px-2 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60"
        >
          <option value="">Detect automatically</option>
          {choices.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
