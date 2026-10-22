import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { PublishedVariant, StorefrontImage } from "@/db/schema";
import { Price, summarizePrice } from "./price";

export interface ProductCardData {
  handle: string;
  title: string;
  images: StorefrontImage[];
  variants: PublishedVariant[];
  priceFromCents: number | null;
  currency: string | null;
  fallbackFields: string[];
}

export function storefrontImageUrl(storeSlug: string, blobId: string): string {
  return `/api/img/${encodeURIComponent(storeSlug)}/${encodeURIComponent(blobId)}`;
}

/** Placeholder instead of a broken <img> when a product has no photo (EC-H8). */
export function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div role="img" aria-label="No image available" className={className ?? "flex h-full w-full items-center justify-center bg-paper-deep text-ink-muted"}>
      <ImageOff aria-hidden className="size-7" strokeWidth={1.5} />
    </div>
  );
}

export function ProductCard({ product, storeSlug, locale, priority = false }: { product: ProductCardData; storeSlug: string; locale: string; priority?: boolean }) {
  const image = product.images[0];
  const titleIsFallback = product.fallbackFields.includes("title");
  return (
    <Link
      href={`/store/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(product.handle)}`}
      className="group block cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-paper-deep hairline">
        {image ? (
          <Image
            src={storefrontImageUrl(storeSlug, image.id)}
            alt={image.alt || product.title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <ImagePlaceholder />
        )}
      </div>
      <div className="mt-3 space-y-1">
        <h3 lang={titleIsFallback ? "en" : undefined} className="font-display text-base leading-snug text-ink group-hover:underline group-hover:underline-offset-4 md:text-lg">
          {product.title}
        </h3>
        <p className="text-sm text-ink">
          <Price summary={summarizePrice(product.variants, product.priceFromCents, product.currency)} locale={locale} />
        </p>
      </div>
    </Link>
  );
}
