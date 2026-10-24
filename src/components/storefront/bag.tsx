"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { formatMoney } from "@/core/i18n/locale";
import { EASE_OUT, settle } from "@/components/ext/motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { bagCount, bagSubtotal, onBagAdd, onBagOpen, removeFromBag, setBagQty, useBag, type BagItem } from "./bag-store";
import { productHref } from "./hrefs";
import { plural, t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Paren, PAREN_LINK, PILL } from "./paren";

const STEP_BUTTON = "inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40";
/** Lines start after the drawer itself has mostly arrived (its own transition is 200 ms). */
const LINE_DELAY_S = 0.1;

/** Header "( Bag 0 )" button plus the slide-over drawer. Opens on click or when a product page dispatches `openBag()`. */
export function Bag({ slug, locale }: { slug: string; locale: string }) {
  const reduce = useReducedMotion();
  const items = useBag(slug);
  const count = bagCount(items);
  const [open, setOpen] = useState(false);
  const [badge, animateBadge] = useAnimate<HTMLSpanElement>();

  useEffect(() => onBagOpen(() => setOpen(true)), []);

  // Bounce on the add event rather than on a count diff: diffing would also bounce once on load for a returning visitor.
  useEffect(
    () =>
      onBagAdd(() => {
        if (!reduce && badge.current) void animateBadge(badge.current, { scale: [1, 1.4, 1] }, { duration: 0.45, ease: EASE_OUT, times: [0, 0.3, 1] });
      }),
    [reduce, badge, animateBadge],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${t(locale, "openBag")}: ${plural(locale, "items", count)}`} className={cn(PAREN_LINK, "px-2 text-current")}>
        <Paren>
          {t(locale, "bag")}
          <span ref={badge} aria-hidden className="num ml-1.5 inline-block">
            {count}
          </span>
        </Paren>
      </button>

      {/* `data-[side=right]:w-full` is needed to beat the sheet's own 3/4-width variant; a plain `w-full` loses on specificity and clipped the line prices on phones. */}
      <SheetContent side="right" showCloseButton={false} className="gap-0 border-0 bg-card p-0 text-ink shadow-[var(--shadow-pop)] data-[side=right]:w-full data-[side=right]:sm:max-w-md data-[side=right]:sm:rounded-l-3xl">
        <div className="flex items-center justify-between px-5 pt-5 md:px-7">
          <SheetTitle className="font-grotesk text-[32px] font-normal leading-none text-ink">
            {t(locale, "bag")} <span className="num text-[18px] text-ink-muted">({count})</span>
          </SheetTitle>
          <button type="button" onClick={() => setOpen(false)} aria-label={t(locale, "close")} className={STEP_BUTTON}>
            <X aria-hidden className="size-5" strokeWidth={1.6} />
          </button>
        </div>
        <SheetDescription className="sr-only">{t(locale, "demoNote")}</SheetDescription>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-2 px-5 py-16 md:px-7">
            <p className="font-grotesk text-[28px] leading-tight text-ink">{t(locale, "bagEmpty")}</p>
            <p className="text-[15px] text-ink-muted">{t(locale, "bagEmptyHint")}</p>
          </div>
        ) : (
          <ul className="mt-4 flex-1 divide-y divide-line overflow-y-auto px-5 md:px-7">
            {items.map((item, i) => (
              <BagLine key={item.key} item={item} index={i} slug={slug} locale={locale} reduce={reduce} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}

        <div className="space-y-4 border-t border-line px-5 py-5 md:px-7">
          <Subtotal items={items} locale={locale} />
          <p className="text-[13px] text-ink-muted">{t(locale, "demoNote")}</p>
          <button type="button" onClick={() => setOpen(false)} className={cn(PILL, "w-full")}>
            <Paren>{t(locale, "continueShopping")}</Paren>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BagLine({ item, index, slug, locale, reduce, onNavigate }: { item: BagItem; index: number; slug: string; locale: string; reduce: boolean | null; onNavigate: () => void }) {
  const href = productHref(slug, item.handle);
  const line = item.priceCents !== null && item.currency ? formatMoney(item.priceCents * item.qty, item.currency, locale) : t(locale, "priceOnRequest");
  return (
    // `layout` closes the gap with a transform when a line above is removed; the drawer remounts on open, so every line enters together.
    <motion.li layout={reduce ? false : "position"} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={settle(reduce, 0.3, LINE_DELAY_S + Math.min(index, 5) * 0.04)} className="flex gap-4 py-5">
      <Link href={href} onClick={onNavigate} className="relative block w-20 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-paper" style={{ aspectRatio: "4 / 5" }}>
        {item.imageId ? <Image src={storefrontImageUrl(slug, item.imageId)} alt="" fill sizes="80px" className="object-cover" /> : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href} onClick={onNavigate} className="font-grotesk text-[18px] leading-tight text-ink outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand">
              {item.title}
            </Link>
            {item.variant ? <p className="mt-1 text-[13px] text-ink-muted">{item.variant}</p> : null}
          </div>
          <button type="button" onClick={() => removeFromBag(slug, item.key)} aria-label={`${t(locale, "remove")}: ${item.title}`} className={cn(STEP_BUTTON, "-mr-3 -mt-2 text-ink-muted")}>
            <X aria-hidden className="size-4" strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-full ring-1 ring-line" role="group" aria-label={t(locale, "quantity")}>
            <button type="button" onClick={() => setBagQty(slug, item.key, item.qty - 1)} aria-label={t(locale, "decrease")} className={STEP_BUTTON}>
              <Minus aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
            <span className="num min-w-8 text-center text-sm" aria-live="polite">
              {item.qty}
            </span>
            <button type="button" onClick={() => setBagQty(slug, item.key, item.qty + 1)} aria-label={t(locale, "increase")} className={STEP_BUTTON}>
              <Plus aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
          </div>
          <span className="num text-sm text-ink">{line}</span>
        </div>
      </div>
    </motion.li>
  );
}

function Subtotal({ items, locale }: { items: BagItem[]; locale: string }) {
  const subtotal = bagSubtotal(items);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[15px] text-ink-muted">{t(locale, "subtotal")}</span>
      <span className="num text-[24px] text-ink">{subtotal ? formatMoney(subtotal.cents, subtotal.currency, locale) : items.length ? t(locale, "perVariant") : "—"}</span>
    </div>
  );
}
