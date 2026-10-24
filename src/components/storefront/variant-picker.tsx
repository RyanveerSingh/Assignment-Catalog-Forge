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
  renderBuy: (current: PublishedVariant | null) => ReactNode;
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
  const facts: Array<[string, string]> = current ? [[t(locale, "sku"), current.sku]] : [];
  if (current?.weightGrams !== null && current?.weightGrams !== undefined) facts.push([t(locale, "weight"), formatWeight(current.weightGrams)]);
  if (dimensions) facts.push([t(locale, "dimensions"), dimensions]);

  return (
    <div className="space-y-7">
      <div aria-live="polite" className="space-y-1">
        {current ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[28px] text-ink md:text-[32px]">{current.priceCents !== null ? formatMoney(current.priceCents, current.currency ?? fallbackCurrency, locale) : t(locale, "priceOnRequest")}</span>
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
        <fieldset key={name} className="space-y-3">
          <legend className="text-[13px] text-ink-muted">
            {optionLabel(locale, name)}
            {selected[name] ? <span className="ml-2 text-ink">{selected[name]}</span> : null}
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
                    "min-h-11 min-w-11 cursor-pointer rounded-full px-4 py-2 text-[15px] outline-none ring-1 ring-inset transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                    checked ? "bg-ink text-white ring-ink" : "bg-card text-ink ring-line hover:ring-ink",
                    !available && "cursor-not-allowed text-ink-muted line-through opacity-60 hover:ring-line",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {renderBuy(current)}

      {facts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-5 text-[14px]">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="num text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
