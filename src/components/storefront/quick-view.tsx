"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import type { PublishedVariant, StorefrontImage } from "@/db/schema";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { onBagOpen } from "./bag-store";
import { BuyBox } from "./buy-box";
import { Gallery } from "./gallery";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

interface QuickViewProduct {
  handle: string;
  title: string;
  /** Leaf label, already title-cased. */
  category: string | null;
  images: StorefrontImage[];
  variants: PublishedVariant[];
  fallbackCurrency: string;
}

const BUTTON =
  "group/paren hidden h-10 cursor-pointer items-center rounded-full bg-card/95 px-4 text-[14px] font-medium text-ink shadow-[var(--shadow-card)] outline-none transition-[opacity,transform,background-color] duration-200 ease-out hover:bg-card focus-visible:ring-2 focus-visible:ring-brand md:inline-flex md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100";

/**
 * "( Quick view )" on a product card: the gallery, price, options and Add to bag of the product
 * page in a dialog, built from the same components. Desktop only (it appears on hover); phones go
 * to the page. When the bag drawer opens after an add, the dialog steps aside so one layer is up at a time.
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
        <Paren>{t(locale, "quickView")}</Paren>
      </button>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-3xl bg-card p-0 text-base text-ink ring-0 shadow-[var(--shadow-pop)] sm:max-w-3xl lg:max-w-5xl">
        <button type="button" onClick={() => setOpen(false)} aria-label={t(locale, "close")} className="absolute right-4 top-4 z-20 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand">
          <X aria-hidden className="size-5" strokeWidth={1.6} />
        </button>
        <div className="grid md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="p-4 md:p-6">
            <Gallery images={product.images} storeSlug={slug} title={product.title} locale={locale} radius="rounded-2xl" />
          </div>
          <div className="flex flex-col gap-7 p-5 pt-2 md:p-8 md:pl-2 md:pr-16 md:pt-10">
            <header>
              {product.category ? <p className="font-serif-italic text-[22px] leading-none text-ink-muted">{product.category}</p> : null}
              <DialogTitle className="mt-2 font-grotesk text-[30px] font-normal leading-[1.04] text-ink md:text-[36px]">{product.title}</DialogTitle>
              <DialogDescription className="sr-only">{t(locale, "quickViewOf", { title: product.title })}</DialogDescription>
            </header>
            <BuyBox slug={slug} locale={locale} variants={product.variants} fallbackCurrency={product.fallbackCurrency} product={{ handle: product.handle, title: product.title, imageId: product.images[0]?.id ?? null }} />
            <Link href={href} className={`${PAREN_LINK} self-start text-ink`}>
              <Paren>{t(locale, "viewDetails")}</Paren>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
