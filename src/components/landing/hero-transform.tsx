"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "cn";

/*
 * Everything shown here is a real row of samples/new-12.csv and the listing CatalogForge wrote
 * from it in the demo store: the German supplier row, with its mojibake, and the published card in
 * each of the three store languages.
 */

export const LANGS = [
  { code: "en", label: "EN", title: "Hand-Turned Stoneware Vase", colours: "4 colours", size: "22 cm tall" },
  { code: "de", label: "DE", title: "Handgedrehte Steinzeugvase", colours: "4 Farben", size: "22 cm hoch" },
  { code: "fr", label: "FR", title: "Vase en grès tourné à la main", colours: "4 couleurs", size: "22 cm de haut" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];

const CLAIMS = [
  { text: "Hand-turned stoneware", quote: "handgedreht", column: "Description" },
  { text: "Glazed inside, watertight", quote: "innen glasiert und daher wasserdicht", column: "Description" },
  { text: "Glazed by hand", quote: "von Hand glasiert", column: "Notes" },
] as const;

const CYCLE_MS = 3200;

/** Cycles the listing language every few seconds until the visitor picks one; `pause` holds it while hovered. */
export function useLangCycle(reduce: boolean | null): { lang: Lang; choose: (l: Lang) => void; pause: (p: boolean) => void } {
  const [lang, setLang] = useState<Lang>("en");
  const [held, setHeld] = useState(false);
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (reduce || held || chosen) return;
    const id = window.setInterval(() => setLang((l) => LANGS[(LANGS.findIndex((x) => x.code === l) + 1) % LANGS.length]?.code ?? "en"), CYCLE_MS);
    return () => window.clearInterval(id);
  }, [reduce, held, chosen]);
  return {
    lang,
    choose: (l) => {
      setLang(l);
      setChosen(true);
    },
    pause: setHeld,
  };
}

function Mojibake({ children }: { children: string }) {
  return (
    <span className="underline decoration-brand decoration-dotted decoration-[1.5px] underline-offset-[3px]" title="Broken encoding: repaired before any AI sees the row">
      {children}
    </span>
  );
}

/** The supplier's row as it arrived, in a small window-chrome frame. */
export function RawSheet({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card text-left shadow-[var(--shadow-card)] ring-1 ring-border", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-paper px-3 py-2">
        <span aria-hidden className="flex gap-1">
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
        </span>
        <span className="num text-[11px] text-ink-muted">new-12.csv · row 8 of 26</span>
      </div>
      <table className="w-full table-fixed border-collapse text-[11px] leading-tight break-words">
        <thead>
          <tr className="bg-paper/70 text-[10px] font-medium tracking-wide text-ink-muted uppercase">
            <th className="w-[22%] px-2 py-1.5 text-left font-medium">SKU</th>
            <th className="w-[30%] px-2 py-1.5 text-left font-medium">Title</th>
            <th className="w-[18%] px-2 py-1.5 text-left font-medium">Price</th>
            <th className="w-[30%] px-2 py-1.5 text-left font-medium">Colour</th>
          </tr>
        </thead>
        <tbody className="num text-ink">
          <tr className="border-t border-border">
            <td className="px-2 py-1.5">ST-VS-SG</td>
            <td className="px-2 py-1.5 font-sans">Steinzeug-Vase</td>
            <td className="px-2 py-1.5">24,00</td>
            <td className="px-2 py-1.5 font-sans">
              <Mojibake>salbeigrÃ¼n</Mojibake>
            </td>
          </tr>
          <tr className="border-t border-border">
            <td className="px-2 py-1.5 align-top text-ink-muted">Descr.</td>
            <td colSpan={3} className="px-2 py-1.5 font-sans text-ink-muted">
              <Mojibake>FlaschenfÃ¶rmige</Mojibake> Vase aus Steinzeug, handgedreht, mit reaktiver Glasur, die <Mojibake>Ã¼ber</Mojibake> den Rillen dunkler aufbricht. Auch innen glasiert und daher wasserdicht…
            </td>
          </tr>
          <tr className="border-t border-border">
            <td className="px-2 py-1.5 text-ink-muted">Dims</td>
            <td colSpan={3} className="px-2 py-1.5 font-sans">
              <Mojibake>Ã˜</Mojibake> 10 cm, H 22 cm · 650 g · EUR
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface CardProps {
  lang: Lang;
  onLang: (l: Lang) => void;
  className?: string;
}

/** The published listing, as the shop shows it, with the three languages to flip between. */
export function ProductCard({ lang, onLang, className }: CardProps) {
  const reduce = useReducedMotion();
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <div className={cn("rounded-[24px] bg-card p-2 text-left shadow-[var(--shadow-pop)] ring-1 ring-border/70", className)}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
        <Image src="/landing/hero-vase.jpg" alt="Sage-green hand-turned stoneware vase, the product photo the supplier sent" fill priority sizes="300px" className="object-cover" />
        <span className="absolute top-2.5 left-2.5 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-medium text-ink shadow-[var(--shadow-card)] backdrop-blur">Published</span>
      </div>
      <div className="flex flex-col gap-3 p-3 pt-3.5">
        <div role="group" aria-label="Listing language" className="flex gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => onLang(l.code)}
              aria-pressed={lang === l.code}
              className={cn(
                "num h-7 min-w-10 cursor-pointer rounded-full px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                lang === l.code ? "bg-brand text-brand-foreground" : "bg-paper text-ink-muted hover:bg-brand-soft hover:text-ink",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="min-h-[3.4rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h3 key={current.code} lang={current.code} className="font-display text-[19px] leading-tight text-ink" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: reduce ? 0 : 0.18 }}>
              {current.title}
            </motion.h3>
          </AnimatePresence>
          <p className="mt-1 text-xs text-ink-muted">
            {current.colours} · {current.size}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="num text-lg text-ink">€24.00</span>
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">5 claims verified</span>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Verified claims and the cell each one came from">
          {CLAIMS.map((c) => (
            <li key={c.text} title={`“${c.quote}” · row 8, ${c.column}`} className="cursor-help rounded-lg bg-brand-soft/70 px-2 py-1 text-[11px] text-ink">
              {c.text}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-muted">Hover a claim to see the supplier&apos;s words it rests on.</p>
      </div>
    </div>
  );
}
