"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "cn";
import type { StorefrontImage } from "@/db/schema";
import { ImagePlaceholder, storefrontImageUrl } from "./product-card";

/** Main image plus thumbnail buttons. State lives here so the server page stays static. */
export function Gallery({ images, storeSlug, title }: { images: StorefrontImage[]; storeSlug: string; title: string }) {
  const [index, setIndex] = useState(0);
  const main = images[index] ?? images[0];

  if (!main) {
    return (
      <div className="aspect-[4/5] overflow-hidden rounded-sm hairline">
        <ImagePlaceholder />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-paper-deep hairline">
        <Image key={main.id} src={storefrontImageUrl(storeSlug, main.id)} alt={main.alt || title} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Product images">
          {images.map((img, i) => {
            const active = i === index;
            return (
              <li key={img.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative block size-16 cursor-pointer overflow-hidden rounded-sm bg-paper-deep outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand",
                    active ? "ring-2 ring-brand" : "opacity-70 hairline hover:opacity-100",
                  )}
                >
                  <Image src={storefrontImageUrl(storeSlug, img.thumbId || img.id)} alt="" fill sizes="64px" className="object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
