"use client";

import { useMemo, useState } from "react";
import { cn } from "cn";
import { StatusBadge } from "@/components/ext/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProductAction, TranslationRow } from "./types";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  descriptionHtml: "Description",
  metaTitle: "Meta title",
  metaDescription: "Meta description",
};

function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (field.startsWith("attributes.")) return `Attribute · ${field.slice("attributes.".length)}`;
  return field;
}

function localeName(locale: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/** One translation cell: status, origin, editable text, save as a manual fix (EC-F3). */
function TranslationField({ row, onAction }: { row: TranslationRow; onAction: (a: ProductAction) => Promise<boolean> }) {
  const [text, setText] = useState(row.text ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = text !== (row.text ?? "");
  const isHtml = row.field === "descriptionHtml";
  const id = `tr-${row.id}`;

  const save = async () => {
    setSaving(true);
    try {
      await onAction({ action: "translate", field: row.field, locale: row.locale, text });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink">
          {fieldLabel(row.field)}
        </label>
        <StatusBadge status={row.status} label={row.status === "fresh" ? "fresh" : row.status === "outdated" ? "out of date" : row.status} className={cn(row.status === "fresh" && "bg-success-soft text-success ring-success/25", row.status === "outdated" && "bg-warning-soft text-warning ring-warning/25", row.status === "failed" && "bg-destructive/10 text-destructive ring-destructive/25")} />
        <span className="text-[11px] uppercase tracking-wide text-ink-muted">{row.origin === "manual" ? "manual" : "AI"}</span>
      </div>
      {row.status === "outdated" ? <p className="text-[11px] text-warning">English changed since this fix; the storefront keeps your text until you update it.</p> : null}
      {row.status === "failed" ? (
        <p className="text-[11px] text-destructive">
          Translation failed{row.error ? `: ${row.error}` : ""}. English will be shown.
        </p>
      ) : null}
      {row.status === "pending" ? <p className="text-[11px] text-ink-muted">Waiting for the translator. English is shown meanwhile.</p> : null}
      <Textarea id={id} value={text} rows={isHtml ? 6 : 2} spellCheck={!isHtml} onChange={(e) => setText(e.target.value)} className={cn("min-h-10 text-xs md:text-xs", isHtml && "font-mono")} />
      <div className="flex items-center gap-2">
        <Button type="button" size="xs" disabled={!dirty || saving} onClick={() => void save()} className="cursor-pointer">
          {saving ? "Saving…" : "Save fix"}
        </Button>
        {dirty && !saving ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setText(row.text ?? "")} className="cursor-pointer">
            Discard
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Translations grouped by locale. Mount with a key that changes on refetch so edited textareas reset to server text. */
export function ReviewTranslations({ translations, onAction }: { translations: TranslationRow[]; onAction: (a: ProductAction) => Promise<boolean> }) {
  const byLocale = useMemo(() => {
    const map = new Map<string, TranslationRow[]>();
    for (const t of translations) map.set(t.locale, [...(map.get(t.locale) ?? []), t]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [translations]);

  if (byLocale.length === 0) return <p className="text-xs text-ink-muted">No translations yet. They are written after the AI stage (or on approval, depending on store settings).</p>;

  return (
    <div className="flex flex-col gap-4">
      {byLocale.map(([locale, rows]) => {
        const outdated = rows.filter((r) => r.status === "outdated").length;
        const failed = rows.filter((r) => r.status === "failed").length;
        return (
          <section key={locale} aria-label={`${localeName(locale)} translations`} className="flex flex-col gap-2">
            <h3 className="flex flex-wrap items-baseline gap-2 font-display text-base text-ink">
              {localeName(locale)}
              <span className="num text-[11px] uppercase text-ink-muted">{locale}</span>
              {outdated ? <span className="text-[11px] text-warning">{outdated} out of date</span> : null}
              {failed ? <span className="text-[11px] text-destructive">{failed} failed</span> : null}
            </h3>
            {rows.map((row) => (
              <TranslationField key={row.id} row={row} onAction={onAction} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
