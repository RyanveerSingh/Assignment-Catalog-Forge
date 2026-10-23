"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { api } from "@/lib/client/api";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

/**
 * "( Open in Deutsch )": sets the country cookie the same way the switcher does (EC-H4), then
 * refreshes, so every page on the site follows. The label is the target language's own name.
 */
export function LocaleLink({ country, label, locale, className }: { country: string; label: string; locale: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        aria-busy={pending}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError(null);
              await api("/api/store-country", { method: "POST", json: { country } });
              router.refresh();
            } catch {
              setError(t(locale, "countryError"));
            }
          })
        }
        className={cn(PAREN_LINK, "disabled:cursor-wait disabled:opacity-60", className)}
      >
        <Paren>{label}</Paren>
      </button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </>
  );
}
