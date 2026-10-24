import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import type { PublishedVariant, StorefrontImage } from "@/db/schema";
import { leafLabel } from "./categories";
import { colourSwatches } from "./colour-names";
import { ColourSwatches } from "./colour-swatches";
import { productHref } from "./hrefs";
import { plural, t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";
import { Price, summarizePrice } from "./price";
import { QuickView } from "./quick-view";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProductCardData {
  handle: string;
  title: string;
  category: string | null;
  images: StorefrontImage[];
  variants: PublishedVariant[];
  priceFromCents: number | null;
  currency: string | null;
  fallbackFields: string[];
  updatedAtMs?: number;
}

/** "3 sizes · 2 colours", counted from the option values actually published. */
function variantHints(variants: PublishedVariant[], locale: string): string | null {
  if (variants.length < 2) return null;
  const values = new Map<string, Set<string>>();
  for (const v of variants)
    for (const [name, value] of Object.entries(v.options)) {
      const set = values.get(name.toLowerCase()) ?? new Set<string>();
      set.add(value);
      values.set(name.toLowerCase(), set);
    }
  const parts: string[] = [];
  const sizes = values.get("size")?.size ?? 0;
  const colours = (values.get("color") ?? values.get("colour"))?.size ?? 0;
  if (sizes > 1) parts.push(plural(locale, "sizes", sizes));
  if (colours > 1) parts.push(plural(locale, "colours", colours));
  if (parts.length === 0) parts.push(plural(locale, "variants", variants.length));
  return parts.join(" · ");
}

/**
 * The photo and the title both lead to the product; the title link is the one the keyboard and
 * assistive tech use, the photo overlay is a pointer convenience. Quick view sits on the photo as a
 * sibling of the link, never inside it, so the card stays valid HTML. On hover the frame lifts by
 * whole pixels and the photo either swaps to the second shot or scales a touch.
 */
export function ProductCard({ product, storeSlug, locale, priority = false, now, fallbackCurrency }: { product: ProductCardData; storeSlug: string; locale: string; priority?: boolean; now?: number; fallbackCurrency: string }) {
  const [first, second] = product.images;
  const titleIsFallback = product.fallbackFields.includes("title");
  const hints = variantHints(product.variants, locale);
  const isNew = now !== undefined && product.updatedAtMs !== undefined && now - product.updatedAtMs < NEW_WINDOW_MS;
  const category = product.category ? leafLabel(product.category) : null;
  const href = productHref(storeSlug, product.handle);
  const colours = colourSwatches(product.variants);
  const meta = [category, hints].filter(Boolean).join(" · ");

  return (
    <div className="group relative">
      <div className="relative overflow-hidden rounded-2xl bg-paper transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1" style={{ aspectRatio: "4 / 5" }}>
        {first ? (
          <>
            <Image
              src={storefrontImageUrl(storeSlug, first.id)}
              alt={first.alt || product.title}
              fill
              sizes="(min-width: 1024px) 30vw, (min-width: 768px) 33vw, 50vw"
              priority={priority}
              className={cn("object-cover", !second && "transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.04]")}
            />
            {second ? (
              // Hidden below md so phones never download a hover image they cannot hover.
              <div className="absolute inset-0 hidden md:block">
                <Image src={storefrontImageUrl(storeSlug, second.id)} alt="" fill sizes="(min-width: 1024px) 30vw, 33vw" className="object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-focus-within:opacity-100" />
              </div>
            ) : null}
          </>
        ) : (
          <ImagePlaceholder label={category ?? t(locale, "noImage")} />
        )}
        <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0 cursor-pointer" />
        {isNew ? <span className="pointer-events-none absolute left-3 top-3 inline-flex h-8 items-center rounded-full bg-card/95 px-3 text-[12px] font-medium text-ink">{t(locale, "new")}</span> : null}
        {product.variants.length > 0 ? (
          <QuickView slug={storeSlug} locale={locale} href={href} product={{ handle: product.handle, title: product.title, category, images: product.images, variants: product.variants, fallbackCurrency: product.currency ?? fallbackCurrency }} className="absolute bottom-3 left-3 z-10" />
        ) : null}
      </div>
      {/* Title and price share a row from md up; on a phone's half-width column the price goes under the title. */}
      <div className="mt-3 md:mt-4 md:flex md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <h3 lang={titleIsFallback ? "en" : undefined} className="font-grotesk text-[19px] leading-[1.12] text-ink md:text-[22px]">
            <Link href={href} className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card">
              {product.title}
            </Link>
          </h3>
          {meta ? <p className="mt-1 text-[13px] text-ink-muted">{meta}</p> : null}
          <ColourSwatches swatches={colours.swatches} more={colours.more} locale={locale} className="mt-2" />
        </div>
        <p className="num mt-2 text-[15px] text-ink md:mt-0 md:shrink-0 md:pt-0.5">
          <Price summary={summarizePrice(product.variants, product.priceFromCents, product.currency)} locale={locale} />
        </p>
      </div>
    </div>
  );
}
