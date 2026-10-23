"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "@/core/i18n/locale";
import type { PublishedVariant } from "@/db/schema";
import { settle } from "@/components/ext/motion";
import { AddToBag, type BagProductSummary } from "./add-to-bag";
import { t } from "./i18n";
import { storefrontImageUrl } from "./image-url";

/**
 * Phone-only bar pinned to the bottom edge while the main "Add to bag" is scrolled away. It slides
 * in with a transform, so nothing above it moves; while hidden it is inert, so nothing in it can be tabbed to.
 */
export function StickyBuyBar({ slug, locale, product, variant, fallbackCurrency, visible }: { slug: string; locale: string; product: BagProductSummary; variant: PublishedVariant | null; fallbackCurrency: string; visible: boolean }) {
  const reduce = useReducedMotion();
  const price = variant ? (variant.priceCents !== null ? formatMoney(variant.priceCents, variant.currency ?? fallbackCurrency, locale) : t(locale, "priceOnRequest")) : t(locale, "comboUnavailable");

  return (
    <motion.div
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ y: visible ? 0 : "110%" }}
      transition={settle(reduce, 0.3)}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/92 px-4 pt-3 shadow-[0_-16px_32px_-20px_rgba(15,23,42,0.3)] backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-3">
        {/* On the narrowest phones the title matters more than the thumbnail: a German "( In den Warenkorb )" pill leaves no room for both. */}
        {product.imageId ? (
          <span className="relative hidden w-10 shrink-0 overflow-hidden rounded-lg bg-paper min-[420px]:block" style={{ aspectRatio: "4 / 5" }}>
            {/* Same URL as the gallery's eager first photo; priority keeps next/image's LCP bookkeeping consistent and costs no extra request. */}
            <Image src={storefrontImageUrl(slug, product.imageId)} alt="" fill priority sizes="40px" className="object-cover" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-grotesk text-[15px] leading-tight text-ink">{product.title}</p>
          <p className="num mt-0.5 truncate text-xs text-ink-muted">{price}</p>
        </div>
        <AddToBag slug={slug} locale={locale} product={product} variant={variant} compact />
      </div>
    </motion.div>
  );
}
