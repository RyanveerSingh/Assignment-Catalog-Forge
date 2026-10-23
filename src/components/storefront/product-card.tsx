import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { cn } from "cn";
import type { PublishedVariant, StorefrontImage } from "@/db/schema";
import { leafLabel } from "./categories";
import { plural, t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Price, summarizePrice } from "./price";

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

/** Quiet placeholder instead of a broken <img> when a product has no photo (EC-H8); names the category so the tile still says something. */
export function ImagePlaceholder({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="img" aria-label={label ?? "No image available"} className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-paper-deep px-4 text-center text-ink-muted", className)}>
      <ImageOff aria-hidden className="size-6" strokeWidth={1.4} />
      {label ? <span className="font-display text-base leading-tight">{label}</span> : null}
    </div>
  );
}

/** "3 sizes · 2 colours", counted from the option values actually published. */
export function variantHints(variants: PublishedVariant[], locale: string): string | null {
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

export function ProductCard({ product, storeSlug, locale, priority = false, now }: { product: ProductCardData; storeSlug: string; locale: string; priority?: boolean; now?: number }) {
  const [first, second] = product.images;
  const titleIsFallback = product.fallbackFields.includes("title");
  const hints = variantHints(product.variants, locale);
  const isNew = now !== undefined && product.updatedAtMs !== undefined && now - product.updatedAtMs < NEW_WINDOW_MS;
  const category = product.category ? leafLabel(product.category) : null;

  return (
    <Link
      href={`/store/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(product.handle)}`}
      className="group block cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
    >
      <div className="relative overflow-hidden rounded-sm bg-paper-deep hairline" style={{ aspectRatio: "4 / 5" }}>
        {first ? (
          <>
            <Image
              src={storefrontImageUrl(storeSlug, first.id)}
              alt={first.alt || product.title}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              priority={priority}
              className={cn("object-cover", !second && "transition-transform duration-500 motion-safe:group-hover:scale-[1.03]")}
            />
            {second ? (
              // Hidden below md so phones never download a hover image they cannot hover.
              <div className="absolute inset-0 hidden md:block">
                <Image src={storefrontImageUrl(storeSlug, second.id)} alt="" fill sizes="(min-width: 1024px) 25vw, 33vw" className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </div>
            ) : null}
          </>
        ) : (
          <ImagePlaceholder label={category ?? t(locale, "noImage")} />
        )}
        {isNew ? <span className="absolute left-2 top-2 rounded-sm bg-paper/95 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink hairline">{t(locale, "new")}</span> : null}
      </div>
      <div className="mt-3 space-y-1">
        <h3 lang={titleIsFallback ? "en" : undefined} className="font-display text-[17px] leading-snug text-ink group-hover:underline group-hover:underline-offset-4 md:text-lg">
          {product.title}
        </h3>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-ink">
          <Price summary={summarizePrice(product.variants, product.priceFromCents, product.currency)} locale={locale} />
          {hints ? <span className="text-xs text-ink-muted">{hints}</span> : null}
        </p>
      </div>
    </Link>
  );
}
