"use client";

import { useState } from "react";
import { LanguagesIcon, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_CHOICES } from "@/core/i18n/locale";
import { SaveBar, SectionCard, useSave } from "./section-card";
import type { SectionProps } from "./settings-form";

const LOCALE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
];

interface MapRow {
  id: number;
  country: string;
  locale: string;
}

let nextRowId = 1;

function rowsFromMap(map: Record<string, string>): MapRow[] {
  return Object.entries(map).map(([country, locale]) => ({ id: nextRowId++, country, locale }));
}

export function LanguagesSection({ settings, disabled, onSave }: SectionProps) {
  const [locales, setLocales] = useState<string[]>(settings.locales.filter((l) => l !== "en"));
  const [rows, setRows] = useState<MapRow[]>(() => rowsFromMap(settings.countryLocaleMap));
  const { state, run, reset } = useSave();

  const countryItems = [
    ...COUNTRY_CHOICES.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
    ...rows.filter((r) => r.country && !COUNTRY_CHOICES.some((c) => c.code === r.country)).map((r) => ({ value: r.country, label: r.country })),
  ];
  const localeItems = [{ value: "en", label: "en · English" }, ...LOCALE_OPTIONS.map((l) => ({ value: l.code, label: `${l.code} · ${l.label}${locales.includes(l.code) ? "" : " (off)"}` }))];

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const r of rows) {
    if (!r.country) continue;
    if (seen.has(r.country)) duplicates.add(r.country);
    seen.add(r.country);
  }
  const unmapped = rows.filter((r) => r.locale !== "en" && !locales.includes(r.locale));

  const save = () =>
    void run(() => {
      const countryLocaleMap: Record<string, string> = {};
      for (const r of rows) if (r.country && r.locale) countryLocaleMap[r.country] = r.locale;
      return onSave({ locales: ["en", ...locales], countryLocaleMap });
    });

  return (
    <SectionCard id="languages" icon={LanguagesIcon} title="Languages" description="Every product is written in English first; enabled languages are translated automatically. The country map decides which language a visitor sees.">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Published languages</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Label className="gap-2 text-ink-muted">
            <Checkbox checked disabled aria-label="English (always on)" />
            English <span className="text-xs">(always on)</span>
          </Label>
          {LOCALE_OPTIONS.map((l) => {
            const id = `locale-${l.code}`;
            return (
              <Label key={l.code} htmlFor={id} className="cursor-pointer gap-2">
                <Checkbox
                  id={id}
                  disabled={disabled}
                  checked={locales.includes(l.code)}
                  className="cursor-pointer"
                  onCheckedChange={(checked) => {
                    setLocales((cur) => (checked ? [...cur, l.code] : cur.filter((c) => c !== l.code)));
                    reset();
                  }}
                />
                {l.label} <span className="num text-xs text-ink-muted">{l.code}</span>
              </Label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Country → language</p>
          <Button
            variant="outline"
            size="xs"
            disabled={disabled}
            onClick={() => {
              setRows((cur) => [...cur, { id: nextRowId++, country: "", locale: "en" }]);
              reset();
            }}
          >
            <Plus aria-hidden />
            Add country
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-ink-muted">No countries mapped: every visitor sees English until they pick a country.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Select
                  items={countryItems}
                  value={row.country || null}
                  disabled={disabled}
                  onValueChange={(v) => {
                    if (typeof v === "string") setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, country: v } : r)));
                    reset();
                  }}
                >
                  <SelectTrigger size="sm" aria-label={`Country for row ${index + 1}`} className="w-full cursor-pointer">
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryItems.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="cursor-pointer">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  items={localeItems}
                  value={row.locale}
                  disabled={disabled}
                  onValueChange={(v) => {
                    if (typeof v === "string") setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, locale: v } : r)));
                    reset();
                  }}
                >
                  <SelectTrigger size="sm" aria-label={`Language for row ${index + 1}`} className="w-full cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {localeItems.map((l) => (
                      <SelectItem key={l.value} value={l.value} className="cursor-pointer">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Remove ${row.country || "row"}`}
                  className="cursor-pointer"
                  onClick={() => {
                    setRows((cur) => cur.filter((r) => r.id !== row.id));
                    reset();
                  }}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {duplicates.size > 0 ? (
          <p role="alert" className="text-xs text-destructive">
            Duplicate country: {[...duplicates].join(", ")}. Remove one row.
          </p>
        ) : null}
        {unmapped.length > 0 ? <p className="text-xs text-warning">{unmapped.map((r) => r.country || "?").join(", ")} point to a language that is switched off; those visitors will see English.</p> : null}
        <p className="text-xs text-ink-muted">Unlisted countries get English. A visitor&apos;s own choice in the storefront always wins over this map.</p>
      </div>

      <SaveBar state={state} disabled={disabled || duplicates.size > 0} onSave={save} />
    </SectionCard>
  );
}
