"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { formatMoney } from "@/core/i18n/locale";
import { EASE_OUT, settle } from "@/components/ext/motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { bagCount, bagSubtotal, onBagAdd, onBagOpen, removeFromBag, setBagQty, useBag, type BagItem } from "./bag-store";
import { plural, t } from "./i18n";
import { storefrontImageUrl } from "./image-url";

const STEP_BUTTON = "inline-flex size-11 cursor-pointer items-center justify-center text-ink outline-none transition-colors hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40";
/** Lines start after the drawer itself has mostly arrived (its own transition is 200 ms). */
const LINE_DELAY_S = 0.1;

/** Header bag button plus the slide-over drawer. Opens on click or when a product page dispatches `openBag()`. */
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
        if (!reduce && badge.current) void animateBadge(badge.current, { scale: [1, 1.35, 1] }, { duration: 0.45, ease: EASE_OUT, times: [0, 0.3, 1] });
      }),
    [reduce, badge, animateBadge],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t(locale, "openBag")}: ${plural(locale, "items", count)}`}
        className="relative inline-flex h-11 min-w-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-ink outline-none transition-colors hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ShoppingBag aria-hidden className="size-5" strokeWidth={1.6} />
        <span className="hidden sm:inline">{t(locale, "bag")}</span>
        <span ref={badge} aria-hidden className={cn("num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5", count > 0 ? "bg-ink text-paper" : "bg-paper-deep text-ink-muted")}>
          {count}
        </span>
      </button>

      {/* `data-[side=right]:w-full` is needed to beat the sheet's own 3/4-width variant; a plain `w-full` loses on specificity and clipped the line prices on phones. */}
      <SheetContent side="right" showCloseButton={false} className="gap-0 border-l border-border bg-paper p-0 text-ink shadow-[-24px_0_48px_-24px_rgba(26,23,20,0.25)] data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <SheetTitle className="font-display text-2xl font-normal text-ink">
            {t(locale, "bag")} <span className="num text-base text-ink-muted">({count})</span>
          </SheetTitle>
          <button type="button" onClick={() => setOpen(false)} aria-label={t(locale, "close")} className={cn(STEP_BUTTON, "rounded-sm")}>
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <SheetDescription className="sr-only">{t(locale, "demoNote")}</SheetDescription>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <ShoppingBag aria-hidden className="size-8 text-ink-muted" strokeWidth={1.4} />
            <p className="font-display text-xl text-ink">{t(locale, "bagEmpty")}</p>
            <p className="text-sm text-ink-muted">{t(locale, "bagEmptyHint")}</p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto px-4 md:px-6">
            {items.map((item, i) => (
              <BagLine key={item.key} item={item} index={i} slug={slug} locale={locale} reduce={reduce} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}

        <div className="space-y-4 border-t border-border px-4 py-4 md:px-6">
          <Subtotal items={items} locale={locale} />
          <p className="text-xs text-ink-muted">{t(locale, "demoNote")}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-sm border border-ink bg-transparent px-4 text-sm font-medium text-ink outline-none transition-colors hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {t(locale, "continueShopping")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BagLine({ item, index, slug, locale, reduce, onNavigate }: { item: BagItem; index: number; slug: string; locale: string; reduce: boolean | null; onNavigate: () => void }) {
  const href = `/store/${encodeURIComponent(slug)}/p/${encodeURIComponent(item.handle)}`;
  const line = item.priceCents !== null && item.currency ? formatMoney(item.priceCents * item.qty, item.currency, locale) : t(locale, "priceOnRequest");
  return (
    // `layout` closes the gap with a transform when a line above is removed; the drawer remounts on open, so every line enters together.
    <motion.li layout={reduce ? false : "position"} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={settle(reduce, 0.3, LINE_DELAY_S + Math.min(index, 5) * 0.04)} className="flex gap-4 py-4">
      <Link href={href} onClick={onNavigate} className="relative block w-20 shrink-0 cursor-pointer overflow-hidden rounded-sm bg-paper-deep hairline" style={{ aspectRatio: "4 / 5" }}>
        {item.imageId ? <Image src={storefrontImageUrl(slug, item.imageId)} alt="" fill sizes="80px" className="object-cover" /> : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href} onClick={onNavigate} className="font-display text-base leading-snug text-ink outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand">
              {item.title}
            </Link>
            {item.variant ? <p className="mt-0.5 text-xs text-ink-muted">{item.variant}</p> : null}
          </div>
          <button type="button" onClick={() => removeFromBag(slug, item.key)} aria-label={`${t(locale, "remove")}: ${item.title}`} className={cn(STEP_BUTTON, "-mr-3 -mt-2 rounded-sm text-ink-muted")}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-sm hairline" role="group" aria-label={t(locale, "quantity")}>
            <button type="button" onClick={() => setBagQty(slug, item.key, item.qty - 1)} aria-label={t(locale, "decrease")} className={cn(STEP_BUTTON, "rounded-l-sm")}>
              <Minus aria-hidden className="size-4" />
            </button>
            <span className="num min-w-8 text-center text-sm" aria-live="polite">
              {item.qty}
            </span>
            <button type="button" onClick={() => setBagQty(slug, item.key, item.qty + 1)} aria-label={t(locale, "increase")} className={cn(STEP_BUTTON, "rounded-r-sm")}>
              <Plus aria-hidden className="size-4" />
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
      <span className="text-sm text-ink-muted">{t(locale, "subtotal")}</span>
      <span className="num font-display text-2xl text-ink">{subtotal ? formatMoney(subtotal.cents, subtotal.currency, locale) : items.length ? t(locale, "perVariant") : "—"}</span>
    </div>
  );
}
