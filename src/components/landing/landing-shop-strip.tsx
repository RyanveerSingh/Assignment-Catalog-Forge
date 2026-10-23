import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { cachedProducts, cachedStore } from "@/app/store/[slug]/storefront-context";
import { storefrontImageUrl } from "@/components/storefront/image-url";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/core/i18n/locale";
import { SHOP_HREF } from "./landing-links";
import { HoverWords } from "./hover-words";
import { Reveal } from "./reveal";
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
    <section id="shop" aria-labelledby="shop-strip-heading" className="scroll-mt-24 py-6 md:py-10">
      <div className={CONTAINER}>
        <div className="overflow-hidden rounded-[32px] bg-surface-2 pt-12 pb-10 md:pt-16 md:pb-14">
          <Reveal className="flex flex-col items-center gap-5 px-6 text-center">
            <p className="text-sm font-medium text-brand">The shop it built</p>
            <h2 id="shop-strip-heading" className="font-display max-w-[22ch] text-[34px] leading-[1.05] text-balance text-ink sm:text-[40px] md:text-[48px]">
              <HoverWords text={`${total} real products, published from one supplier sheet`} />
            </h2>
            <Link href={SHOP_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
              Open the shop
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </Reveal>
          <div className="relative mt-10 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            <ul className="animate-marquee flex w-max gap-4 px-4 hover:[animation-play-state:paused] md:px-6" aria-label="Products in the demo shop">
              {track.map((p, i) => {
                const img = p.images[0];
                if (!img) return null;
                const duplicate = i >= products.length;
                return (
                  <li key={`${p.handle}-${i}`} className="w-[200px] shrink-0 sm:w-[230px]" aria-hidden={duplicate || undefined}>
                    <Link href={`/store/${STORE_SLUG}/p/${p.handle}`} tabIndex={duplicate ? -1 : undefined} className="group block rounded-2xl bg-card p-2 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-paper">
                        <Image src={storefrontImageUrl(STORE_SLUG, img.id)} alt={img.alt || p.title} fill sizes="230px" loading="lazy" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                      </div>
                      <div className="px-2 pt-2.5 pb-1.5">
                        <p className="font-display truncate text-[15px] leading-tight text-ink">{p.title}</p>
                        <p className="num mt-1 text-xs text-ink-muted">{p.priceFromCents !== null && p.currency ? formatMoney(p.priceFromCents, p.currency, "en") : "Price on request"}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
