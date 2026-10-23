"use client";

import { useState } from "react";
import { cn } from "cn";
import { normalizeColor } from "@/core/clean/color";
import { parsePrice } from "@/core/clean/price";
import { repairMojibake } from "@/core/clean/text";
import { parseDimensions, parseWeight } from "@/core/clean/units";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { CONTAINER } from "./site-chrome";

/*
 * The import's own cleaning functions, run in the browser on whatever the visitor types. Nothing
 * leaves the page: src/core is pure TypeScript with no server behind it.
 */

interface Cell {
  key: string;
  label: string;
  hint: string;
  initial: string;
  run: (raw: string) => { value: string; note: string; ok: boolean };
}

const money = new Map<string, Intl.NumberFormat>();
function formatMoney(cents: number, currency: string): string {
  let f = money.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en", { style: "currency", currency });
    } catch {
      f = new Intl.NumberFormat("en", { minimumFractionDigits: 2 });
    }
    money.set(currency, f);
  }
  return `${f.format(cents / 100)}${/^[A-Z]{3}$/.test(currency) ? ` ${currency}` : ""}`;
}

const CELLS: readonly Cell[] = [
  {
    key: "price",
    label: "Price",
    hint: "any format, any symbol",
    initial: "1.299,00 €",
    run: (raw) => {
      const p = parsePrice(raw, { defaultCurrency: "EUR" });
      if (!p.money) return { value: "needs review", note: p.issues[0]?.message ?? "No price found", ok: false };
      return { value: formatMoney(p.money.cents, p.money.currency), note: `${p.money.cents} cents · currency from ${p.currencySource === "value" ? "the symbol" : "the store default"} · confidence ${p.confidence}`, ok: p.issues.every((i) => i.severity !== "error") };
    },
  },
  {
    key: "weight",
    label: "Weight",
    hint: "kg, g, lbs, oz",
    initial: "4 lbs",
    run: (raw) => {
      const w = parseWeight(raw);
      if (!w) return { value: "not a weight", note: "Left empty, row flagged", ok: false };
      return { value: `${w.grams.toLocaleString("en")} g`, note: w.assumed ? "No unit given, so grams were assumed and flagged" : "Integer grams, never a float", ok: true };
    },
  },
  {
    key: "dims",
    label: "Dimensions",
    hint: "cm, mm, in, Ø",
    initial: "Ø 10 cm, H 22 cm",
    run: (raw) => {
      const d = parseDimensions(raw);
      if (!d) return { value: "not a size", note: "Left empty, row flagged", ok: false };
      const parts = [d.dims.diameterCm !== undefined ? `Ø ${d.dims.diameterCm} cm` : null, d.dims.lengthCm !== undefined ? `L ${d.dims.lengthCm} cm` : null, d.dims.widthCm !== undefined ? `W ${d.dims.widthCm} cm` : null, d.dims.heightCm !== undefined ? `H ${d.dims.heightCm} cm` : null].filter((s): s is string => s !== null);
      return { value: parts.join(" · "), note: d.assumed ? "Unit or order assumed and flagged" : "Centimetres to one decimal", ok: true };
    },
  },
  {
    key: "colour",
    label: "Colour",
    hint: "English, German or French",
    initial: "dunkelblau",
    run: (raw) => {
      const c = normalizeColor(raw);
      if (!c.primary) return { value: "unknown colour", note: "Kept as typed, flagged for review", ok: false };
      const how = c.method === "exact" ? "Exact match" : c.method === "fuzzy" ? "Typo-tolerant match" : "Known synonym";
      return { value: c.primary, note: `${how} · confidence ${c.confidence}`, ok: true };
    },
  },
  {
    key: "text",
    label: "Text",
    hint: "broken encodings",
    initial: "nÃ¤chstgrÃ¶ÃŸere GrÃ¶ÃŸe",
    run: (raw) => {
      const t = repairMojibake(raw);
      return { value: t.text, note: t.repaired ? "Double-encoded UTF-8 repaired" : "Nothing to repair", ok: true };
    },
  },
];

function TryCell({ cell }: { cell: Cell }) {
  const [raw, setRaw] = useState(cell.initial);
  const result = cell.run(raw);
  const id = `try-${cell.key}`;
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/70 focus-within:ring-brand/40">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wider text-ink-muted uppercase">{cell.label}</span>
        <span className="truncate text-[11px] text-ink-muted/80">{cell.hint}</span>
      </label>
      <input id={id} value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} autoComplete="off" className="num h-11 w-full rounded-xl border border-input bg-paper px-3 text-sm text-ink transition-[box-shadow,border-color] outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/25" />
      <div className="min-h-[3.5rem]">
        <p className={cn("num text-base font-medium", result.ok ? "text-ink" : "text-brand")}>{result.value}</p>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">{result.note}</p>
      </div>
    </div>
  );
}

export function LandingTryIt() {
  return (
    <section id="try" aria-labelledby="try-heading" className="scroll-mt-24 pt-10 pb-20 md:pt-12 md:pb-28">
      <div className={CONTAINER}>
        <SectionHeading id="try-heading" eyebrow="Try the cleaner" title="Type a value the way your supplier writes it" text="This is the same code the import runs on every row, running here in your browser. Nothing you type is sent anywhere." />
        <Reveal delay={0.1}>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CELLS.map((c) => (
              <TryCell key={c.key} cell={c} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
