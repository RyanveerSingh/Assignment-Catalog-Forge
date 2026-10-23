"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "cn";
import { formatMoney } from "@/core/i18n/locale";
import type { Dimensions } from "@/core/types";
import type { PublishedVariant } from "@/db/schema";
import { optionLabel, t } from "./i18n";

function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 1)} kg`;
  return `${grams} g`;
}

function formatDimensions(d: Dimensions): string | null {
  if (d.diameterCm !== undefined) return `Ø ${d.diameterCm} cm${d.heightCm !== undefined ? ` × ${d.heightCm} cm` : ""}`;
  const parts = [d.lengthCm, d.widthCm, d.heightCm].filter((n): n is number => n !== undefined);
  return parts.length ? `${parts.join(" × ")} cm` : null;
}

/**
 * Option selectors derived from the published variants. A value is disabled when no variant has it
 * together with the other selected values, so an impossible combination can never be chosen.
 * The price sits above the options and follows the selection; `renderBuy` receives the resolved
 * variant so the add-to-bag control can live below the options without owning any of this state.
 */
export function VariantPicker({
  variants,
  locale,
  fallbackCurrency,
  renderBuy,
}: {
  variants: PublishedVariant[];
  locale: string;
  fallbackCurrency: string;
  renderBuy?: (current: PublishedVariant | null) => ReactNode;
}) {
  const optionNames = useMemo(() => {
    const names: string[] = [];
    for (const v of variants) for (const k of Object.keys(v.options)) if (!names.includes(k)) names.push(k);
    return names;
  }, [variants]);

  const valuesByOption = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const name of optionNames) {
      const values: string[] = [];
      for (const v of variants) {
        const value = v.options[name];
        if (value !== undefined && !values.includes(value)) values.push(value);
      }
      map.set(name, values);
    }
    return map;
  }, [optionNames, variants]);

  const [selected, setSelected] = useState<Record<string, string>>(() => ({ ...(variants[0]?.options ?? {}) }));

  const matches = (v: PublishedVariant, except?: string) => optionNames.every((n) => n === except || (v.options[n] ?? "") === (selected[n] ?? ""));
  const current = variants.find((v) => matches(v)) ?? null;
  const currencies = new Set(variants.map((v) => v.currency).filter((c): c is string => c !== null));
  const mixedCurrencies = currencies.size > 1;

  if (variants.length === 0) return <p className="text-ink-muted">{t(locale, "noVariants")}</p>;

  const dimensions = current?.dimensions ? formatDimensions(current.dimensions) : null;

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-1">
        {current ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-2xl text-ink md:text-[28px]">{current.priceCents !== null ? formatMoney(current.priceCents, current.currency ?? fallbackCurrency, locale) : t(locale, "priceOnRequest")}</span>
            {current.compareAtCents !== null && current.priceCents !== null && current.compareAtCents > current.priceCents ? (
              <s className="num text-sm text-ink-muted" aria-label={t(locale, "previousPrice")}>
                {formatMoney(current.compareAtCents, current.currency ?? fallbackCurrency, locale)}
              </s>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t(locale, "comboUnavailable")}</p>
        )}
        {mixedCurrencies ? <p className="text-xs text-ink-muted">{t(locale, "mixedCurrencies")}</p> : null}
      </div>

      {optionNames.map((name) => (
        <fieldset key={name} className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
            {optionLabel(locale, name)}
            {selected[name] ? <span className="ml-2 normal-case tracking-normal text-ink">{selected[name]}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={optionLabel(locale, name)}>
            {(valuesByOption.get(name) ?? []).map((value) => {
              const checked = selected[name] === value;
              const available = variants.some((v) => v.options[name] === value && matches(v, name));
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={!available}
                  title={available ? undefined : t(locale, "notAvailable")}
                  onClick={() => setSelected((s) => ({ ...s, [name]: value }))}
                  className={cn(
                    "min-h-11 min-w-11 cursor-pointer rounded-sm border px-4 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                    checked ? "border-ink bg-ink text-paper" : "border-border bg-card text-ink hover:border-ink",
                    !available && "cursor-not-allowed border-dashed text-ink-muted line-through opacity-60 hover:border-border",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {renderBuy ? renderBuy(current) : null}

      {current ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
          <dt className="text-ink-muted">{t(locale, "sku")}</dt>
          <dd className="num">{current.sku}</dd>
          {current.weightGrams !== null ? (
            <>
              <dt className="text-ink-muted">{t(locale, "weight")}</dt>
              <dd className="num">{formatWeight(current.weightGrams)}</dd>
            </>
          ) : null}
          {dimensions ? (
            <>
              <dt className="text-ink-muted">{t(locale, "dimensions")}</dt>
              <dd className="num">{dimensions}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
