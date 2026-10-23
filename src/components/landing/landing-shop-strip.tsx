import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "cn";
import type { DemoShop } from "./demo-shop";
import { SHOP_HREF } from "./landing-links";
import { CONTAINER } from "./site-chrome";

/* One large tile beside two rows of four fills the grid exactly. */
const MAX_TILES = 9;

/**
 * The shop the sample import built, as it stands now: real published products of the demo store,
 * photo first. Nothing is mocked; a product published in the demo appears here within 30 s.
 */
export function LandingShopStrip({ shop }: { shop: DemoShop }) {
  const tiles = shop.tiles.slice(0, MAX_TILES);
  if (tiles.length < 4) return null;

  return (
    <section id="shop" aria-labelledby="shop-heading" className="scroll-mt-20 border-b border-border py-14 md:py-20">
      <div className={cn(CONTAINER, "max-w-[1320px]")}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 id="shop-heading" className="font-display text-[34px] leading-[0.98] tracking-[-0.03em] text-ink md:text-[56px]">
            {shop.total} products,
            <br />
            <span className="text-ink-muted">one supplier sheet.</span>
          </h2>
          <Link href={SHOP_HREF} className="num group inline-flex items-center gap-1.5 border-b border-ink pb-0.5 text-sm text-ink transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
            /store/demo
            <ArrowUpRightIcon aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 md:mt-10 md:grid-cols-4 md:gap-x-4 md:gap-y-8">
          {tiles.map((t, i) => (
            <li key={t.href} className={cn(i === 0 && "col-span-2 md:row-span-2")}>
              <Link href={t.href} className="group flex h-full flex-col focus-visible:outline-none">
                <span className={cn("relative block overflow-hidden rounded-md bg-paper ring-1 ring-border group-focus-visible:ring-2 group-focus-visible:ring-brand", i === 0 ? "aspect-square md:aspect-auto md:flex-1" : "aspect-square")}>
                  <Image src={t.src} alt={t.title} fill sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"} className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
                </span>
                <span className="mt-2.5 flex items-baseline justify-between gap-3">
                  <span className={cn("font-display truncate text-ink", i === 0 ? "text-[20px] md:text-[24px]" : "text-[15px]")}>{t.title}</span>
                  <span className="num shrink-0 text-[13px] text-ink-muted">{t.price}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
