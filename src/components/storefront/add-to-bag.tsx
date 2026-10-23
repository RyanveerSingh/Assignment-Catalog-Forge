"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import type { PublishedVariant } from "@/db/schema";
import { settle } from "@/components/ext/motion";
import { addToBag, openBag } from "./bag-store";
import { optionLabel, t } from "./i18n";
import { Paren, PILL } from "./paren";

const MAX_QTY = 99;
/** Long enough to register, short enough that the button is ready again before the drawer has settled. */
const CONFIRM_MS = 600;
/** The drawer waits a beat so "Added ✓" and the count bounce land where the eye already is, then slides in over them. */
const OPEN_DELAY_MS = 450;
const STEP_BUTTON = "inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40";
/** Both labels share one grid cell, so the button keeps the wider label's width and never shifts. */
const LABEL = "col-start-1 row-start-1 inline-flex items-center justify-center gap-2";

export interface BagProductSummary {
  handle: string;
  title: string;
  imageId: string | null;
}

/**
 * Quantity stepper and the ink pill "( Add to bag )". Disabled until the picker resolves a
 * variant. `compact` drops the stepper (always one) for the phone bar, where there is no room for it.
 */
export function AddToBag({ slug, locale, product, variant, compact = false }: { slug: string; locale: string; product: BagProductSummary; variant: PublishedVariant | null; compact?: boolean }) {
  const reduce = useReducedMotion();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const open = window.setTimeout(openBag, reduce ? 0 : OPEN_DELAY_MS);
    const reset = window.setTimeout(() => setAdded(false), CONFIRM_MS);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(reset);
    };
  }, [added, reduce]);

  const submit = () => {
    if (!variant) return;
    const label = Object.entries(variant.options)
      .map(([name, value]) => `${optionLabel(locale, name)} ${value}`)
      .join(" · ");
    addToBag(slug, { handle: product.handle, sku: variant.sku, title: product.title, variant: label, priceCents: variant.priceCents, currency: variant.currency, imageId: variant.imageIds[0] ?? product.imageId }, qty);
    // A second press while the confirmation is still up only bumps the quantity; the drawer is already on its way.
    if (added) openBag();
    setAdded(true);
  };

  const button = (
    <button type="button" onClick={submit} disabled={!variant} className={cn(PILL, compact ? "h-11 shrink-0 px-4 text-[14px]" : "flex-1", added && "bg-brand")}>
      <span className="grid" aria-hidden>
        <motion.span className={LABEL} animate={added ? { opacity: 0, y: -6 } : { opacity: 1, y: 0 }} transition={settle(reduce, 0.18)}>
          <Paren>{t(locale, "addToBag")}</Paren>
        </motion.span>
        <motion.span className={LABEL} animate={added ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }} transition={settle(reduce, 0.18)}>
          <motion.span className="inline-flex" animate={{ scale: added ? 1 : 0.5 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 22 }}>
            <Check aria-hidden className="size-4" />
          </motion.span>
          {t(locale, "addedToBag")}
        </motion.span>
      </span>
      <span className="sr-only" aria-live="polite">
        {added ? t(locale, "addedToBag") : t(locale, "addToBag")}
      </span>
    </button>
  );

  if (compact) return button;

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="inline-flex items-center rounded-full bg-card ring-1 ring-line" role="group" aria-label={t(locale, "quantity")}>
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t(locale, "decrease")} className={STEP_BUTTON}>
          <Minus aria-hidden className="size-4" strokeWidth={1.6} />
        </button>
        <span className="num min-w-9 text-center text-[15px] text-ink" aria-live="polite">
          {qty}
        </span>
        <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} disabled={qty >= MAX_QTY} aria-label={t(locale, "increase")} className={STEP_BUTTON}>
          <Plus aria-hidden className="size-4" strokeWidth={1.6} />
        </button>
      </div>
      {button}
    </div>
  );
}
