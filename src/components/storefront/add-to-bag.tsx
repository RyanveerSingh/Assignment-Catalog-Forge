"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "cn";
import type { PublishedVariant } from "@/db/schema";
import { addToBag, openBag } from "./bag-store";
import { optionLabel, t } from "./i18n";

const MAX_QTY = 99;
const STEP_BUTTON = "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-ink outline-none transition-colors hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40";

export interface BagProductSummary {
  handle: string;
  title: string;
  imageId: string | null;
}

/** Quantity stepper and the one accent-coloured button on the page. Disabled until the picker resolves a variant. */
export function AddToBag({ slug, locale, product, variant }: { slug: string; locale: string; product: BagProductSummary; variant: PublishedVariant | null }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(false), 2000);
    return () => window.clearTimeout(id);
  }, [added]);

  const submit = () => {
    if (!variant) return;
    const label = Object.entries(variant.options)
      .map(([name, value]) => `${optionLabel(locale, name)} ${value}`)
      .join(" · ");
    addToBag(slug, { handle: product.handle, sku: variant.sku, title: product.title, variant: label, priceCents: variant.priceCents, currency: variant.currency, imageId: variant.imageIds[0] ?? product.imageId }, qty);
    setAdded(true);
    openBag();
  };

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div className="inline-flex items-center rounded-sm bg-card hairline" role="group" aria-label={t(locale, "quantity")}>
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t(locale, "decrease")} className={cn(STEP_BUTTON, "rounded-l-sm")}>
          <Minus aria-hidden className="size-4" />
        </button>
        <span className="num min-w-9 text-center text-sm text-ink" aria-live="polite">
          {qty}
        </span>
        <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} disabled={qty >= MAX_QTY} aria-label={t(locale, "increase")} className={cn(STEP_BUTTON, "rounded-r-sm")}>
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!variant}
        className={cn(
          "inline-flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm px-5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50",
          added ? "bg-ink text-paper" : "bg-brand text-brand-foreground hover:bg-ink",
        )}
      >
        {added ? <Check aria-hidden className="size-4" /> : null}
        <span aria-live="polite">{added ? t(locale, "addedToBag") : t(locale, "addToBag")}</span>
      </button>
    </div>
  );
}
