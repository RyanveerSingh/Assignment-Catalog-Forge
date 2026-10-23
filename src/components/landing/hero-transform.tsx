"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "cn";

/*
 * Everything shown here is a real row of samples/new-12.csv and the listing CatalogForge wrote
 * from it in the demo store: the German supplier row, with its mojibake, on the left; the
 * published card, in each of the three store languages, on the right.
 */

const LANGS = [
  { code: "en", label: "EN", title: "Hand-Turned Stoneware Vase", colours: "4 colours", size: "22 cm tall" },
  { code: "de", label: "DE", title: "Handgedrehte Steinzeugvase", colours: "4 Farben", size: "22 cm hoch" },
  { code: "fr", label: "FR", title: "Vase en grès tourné à la main", colours: "4 couleurs", size: "22 cm de haut" },
] as const;
type Lang = (typeof LANGS)[number]["code"];

const CLAIMS = [
  { text: "Hand-turned stoneware", quote: "handgedreht", column: "Description" },
  { text: "Glazed inside, watertight", quote: "innen glasiert und daher wasserdicht", column: "Description" },
  { text: "Glazed by hand", quote: "von Hand glasiert", column: "Notes" },
] as const;

const CYCLE_MS = 3200;

function Mojibake({ children }: { children: string }) {
  return (
    <span className="underline decoration-brand decoration-dotted decoration-[1.5px] underline-offset-[3px]" title="Broken encoding: repaired before any AI sees the row">
      {children}
    </span>
  );
}

function RawSheet() {
  return (
    <div className="w-full max-w-[360px] overflow-hidden bg-card text-left hairline">
      <div className="flex items-center gap-2 border-b border-border bg-paper-deep/60 px-3 py-2">
        <span aria-hidden className="flex gap-1">
          <i className="size-2 rounded-full bg-border" />
          <i className="size-2 rounded-full bg-border" />
          <i className="size-2 rounded-full bg-border" />
        </span>
        <span className="num text-[11px] text-ink-muted">new-12.csv · row 8 of 26</span>
      </div>
      <table className="w-full table-fixed border-collapse text-[11px] leading-tight break-words">
        <thead>
          <tr className="bg-paper-deep/40 text-[10px] font-medium tracking-wide text-ink-muted uppercase">
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

function FlowArrow({ vertical, animate }: { vertical: boolean; animate: boolean }) {
  const length = 64;
  const d = vertical ? `M 8 2 L 8 ${length - 8}` : `M 2 8 L ${length - 8} 8`;
  const head = vertical ? `M 2 ${length - 14} L 8 ${length - 6} L 14 ${length - 14}` : `M ${length - 14} 2 L ${length - 6} 8 L ${length - 14} 14`;
  return (
    <svg aria-hidden width={vertical ? 16 : length} height={vertical ? length : 16} viewBox={vertical ? `0 0 16 ${length}` : `0 0 ${length} 16`} className="shrink-0 text-brand">
      <motion.path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="4 6" animate={animate ? { strokeDashoffset: [0, -20] } : undefined} transition={{ duration: 1.1, ease: "linear", repeat: Infinity }} />
      <path d={head} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductCard({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const reduce = useReducedMotion();
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <div className="w-full bg-card text-left shadow-[0_18px_40px_-24px_rgba(26,23,20,0.35)] hairline">
      <div className="relative aspect-[5/4] overflow-hidden bg-paper-deep">
        <Image src="/landing/hero-vase.jpg" alt="Sage-green hand-turned stoneware vase, the product photo the supplier sent" fill priority sizes="(min-width: 1024px) 320px, 90vw" className="object-cover" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div role="group" aria-label="Listing language" className="flex gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => onLang(l.code)}
              aria-pressed={lang === l.code}
              className={cn(
                "num h-7 min-w-10 cursor-pointer rounded-full px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                lang === l.code ? "bg-ink text-paper" : "bg-paper-deep text-ink-muted hover:text-ink",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="min-h-[3.25rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h3
              key={current.code}
              lang={current.code}
              className="font-display text-xl leading-tight text-ink"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {current.title}
            </motion.h3>
          </AnimatePresence>
          <p className="mt-1 text-xs text-ink-muted">
            {current.colours} · {current.size}
          </p>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="num text-lg text-ink">€24.00</span>
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">5 claims verified</span>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Verified claims and the cell each one came from">
          {CLAIMS.map((c) => (
            <li key={c.text} title={`“${c.quote}” · row 8, ${c.column}`} className="cursor-help rounded-sm bg-brand-soft/70 px-2 py-1 text-[11px] text-ink">
              {c.text}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-muted">Hover a claim to see the supplier&apos;s words it rests on.</p>
      </div>
    </div>
  );
}

/** Raw supplier row on the left, the finished listing on the right, cycling through the store languages. */
export function HeroTransform() {
  const reduce = useReducedMotion();
  const [lang, setLang] = useState<Lang>("en");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => {
      setLang((l) => LANGS[(LANGS.findIndex((x) => x.code === l) + 1) % LANGS.length]?.code ?? "en");
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [reduce, paused]);

  const choose = (l: Lang): void => {
    setLang(l);
    setPaused(true);
  };

  const enter = (x: number) => (reduce ? {} : { initial: { opacity: 0, x }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)] md:gap-3" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <motion.div {...enter(-18)} className="w-full max-w-[360px] justify-self-center md:justify-self-end">
        <p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">What the supplier sent</p>
        <RawSheet />
      </motion.div>
      <div className="flex justify-center">
        <span className="hidden md:block">
          <FlowArrow vertical={false} animate={!reduce} />
        </span>
        <span className="md:hidden">
          <FlowArrow vertical animate={!reduce} />
        </span>
      </div>
      <motion.div {...enter(18)} className="w-full max-w-[320px] justify-self-center md:justify-self-start">
        <p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-brand uppercase">What the shop shows</p>
        <ProductCard lang={lang} onLang={choose} />
      </motion.div>
    </div>
  );
}
