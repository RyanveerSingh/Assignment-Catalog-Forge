"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, X } from "lucide-react";
import { cn } from "cn";
import type { PublishedVariant, StorefrontImage } from "@/db/schema";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { onBagOpen } from "./bag-store";
import { BuyBox } from "./buy-box";
import { Gallery } from "./gallery";
import { t } from "./i18n";

export interface QuickViewProduct {
  handle: string;
  title: string;
  /** Leaf label, already title-cased. */
  category: string | null;
  images: StorefrontImage[];
  variants: PublishedVariant[];
  fallbackCurrency: string;
}

const BUTTON =
  "hidden h-10 cursor-pointer items-center justify-center gap-2 rounded-sm bg-paper/95 text-sm text-ink hairline outline-none transition-[opacity,transform,background-color] duration-200 ease-out hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand md:inline-flex md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100";

/**
 * "Quick view" on a product card: the gallery, price, options and Add to bag of the product page
 * in a dialog, built from the same components. Desktop only (it appears on hover); phones go to
 * the page. When the bag drawer opens after an add, the dialog steps aside so one layer is up at a time.
 */
export function QuickView({ slug, locale, product, href, className }: { slug: string; locale: string; product: QuickViewProduct; href: string; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    return onBagOpen(() => setOpen(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} aria-label={t(locale, "quickViewOf", { title: product.title })} className={cn(BUTTON, className)}>
        <Eye aria-hidden className="size-4" strokeWidth={1.6} />
        {t(locale, "quickView")}
      </button>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-sm bg-paper p-0 text-base text-ink ring-0 hairline sm:max-w-3xl lg:max-w-4xl">
        <button type="button" onClick={() => setOpen(false)} aria-label={t(locale, "close")} className="absolute right-3 top-3 z-20 inline-flex size-11 cursor-pointer items-center justify-center rounded-sm text-ink outline-none transition-colors hover:bg-paper-deep focus-visible:ring-2 focus-visible:ring-brand">
          <X aria-hidden className="size-5" />
        </button>
        <div className="grid md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="p-4 md:p-6">
            <Gallery images={product.images} storeSlug={slug} title={product.title} locale={locale} />
          </div>
          <div className="flex flex-col gap-6 p-4 pt-0 md:p-6 md:pl-0 md:pr-16">
            <header className="space-y-2">
              {product.category ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{product.category}</p> : null}
              <DialogTitle className="font-display text-2xl font-normal leading-[1.08] text-ink md:text-3xl">{product.title}</DialogTitle>
              <DialogDescription className="sr-only">{t(locale, "quickViewOf", { title: product.title })}</DialogDescription>
            </header>
            <BuyBox slug={slug} locale={locale} variants={product.variants} fallbackCurrency={product.fallbackCurrency} product={{ handle: product.handle, title: product.title, imageId: product.images[0]?.id ?? null }} />
            <Link href={href} className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-sm text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
              {t(locale, "viewDetails")}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
