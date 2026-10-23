import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { cachedProducts, cachedStore } from "@/app/store/[slug]/storefront-context";
import { storefrontImageUrl } from "@/components/storefront/image-url";
import { formatMoney } from "@/core/i18n/locale";
import { CONTAINER } from "./site-chrome";

const STORE_SLUG = "demo";
const MAX_CARDS = 12;

/**
 * The shop the sample import built, as it stands right now: real published products from the demo
 * store, read through the same 30 s cache the storefront uses, in a slow marquee. Nothing here is
 * mocked; a merchant who publishes a product in the demo sees it appear.
 */
export async function LandingShopStrip() {
  const store = await cachedStore(STORE_SLUG);
  if (!store) return null;
  const { items, total } = await cachedProducts(store.id, "en", { page: 1, sort: "newest" });
  const products = items.filter((p) => p.images.length > 0).slice(0, MAX_CARDS);
  if (products.length < 3) return null;
  // Two copies make the loop seamless: the track scrolls exactly one copy's width, then starts over.
  const track = [...products, ...products];

  return (
    <section aria-labelledby="shop-strip-heading" className="overflow-hidden border-b border-border bg-paper-deep/40">
      <div className={cn(CONTAINER, "flex flex-wrap items-end justify-between gap-4 pt-14 pb-8 md:pt-20")}>
        <div>
          <h2 id="shop-strip-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
            The shop it built
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-ink md:text-4xl">
            {total} real products, published from one supplier sheet.
          </p>
        </div>
        <Link href={`/store/${STORE_SLUG}`} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 text-sm text-ink transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          Open the shop
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="relative pb-14 md:pb-20 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <ul className="animate-marquee flex w-max gap-4 px-4 hover:[animation-play-state:paused] md:px-6" aria-label="Products in the demo shop">
          {track.map((p, i) => {
            const img = p.images[0]!;
            const duplicate = i >= products.length;
            return (
              <li key={`${p.handle}-${i}`} className="w-[200px] shrink-0 sm:w-[230px]" aria-hidden={duplicate || undefined}>
                <Link href={`/store/${STORE_SLUG}/p/${p.handle}`} tabIndex={duplicate ? -1 : undefined} className="group block bg-card hairline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                  <div className="relative aspect-[4/5] overflow-hidden bg-paper-deep">
                    <Image src={storefrontImageUrl(STORE_SLUG, img.id)} alt={img.alt || p.title} fill sizes="230px" loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="font-display truncate text-base leading-tight text-ink">{p.title}</p>
                    <p className="num mt-1 text-xs text-ink-muted">{p.priceFromCents !== null && p.currency ? formatMoney(p.priceFromCents, p.currency, "en") : "Price on request"}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
