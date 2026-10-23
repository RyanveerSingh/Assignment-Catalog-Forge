import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import { CLAIMS, LISTING } from "./hero-sheet-data";
import { AT, langIndex } from "./hero-timeline";

export interface ShopTile {
  href: string;
  title: string;
  price: string;
  src: string;
}

const SHOW = "translate-y-0 opacity-100";
const HIDE = "translate-y-3 opacity-0";

/** The listing written from the vase rows, then the shop it lands in. Visibility is driven by the hero clock. */
export function HeroListing({
  tick,
  still,
  tiles,
}: {
  tick: number;
  still: boolean;
  tiles: readonly ShopTile[];
}) {
  const lang = langIndex(tick, still);
  const published = tick >= AT.published;
  const written = tick >= AT.card || still;
  const tag = published ? "Published" : written ? "Draft" : "Supplier photo";

  return (
    <div className="flex flex-col gap-3">
      <article className="overflow-hidden rounded-lg bg-card ring-1 ring-border">
        <div className="relative aspect-[16/11] bg-paper">
          <Image
            src="/landing/hero-vase.webp"
            alt="Sage-green hand-turned stoneware vase, the photo the supplier sent with the sheet"
            width={680}
            height={468}
            unoptimized
            priority
            className="absolute inset-0 size-full object-cover"
          />
          <span
            className={cn(
              "num absolute top-2.5 left-2.5 rounded-sm px-1.5 py-0.5 text-[10.5px]",
              published ? "bg-ink text-white" : "bg-white text-ink",
            )}
          >
            {tag}
          </span>
          <span className="num absolute top-2.5 right-2.5 flex overflow-hidden rounded-sm bg-white text-[10.5px]">
            {LISTING.map((l, i) => (
              <span
                key={l.lang}
                className={cn(
                  "px-1.5 py-0.5",
                  i === lang ? "bg-brand text-white" : "text-ink-muted",
                )}
              >
                {l.lang}
              </span>
            ))}
          </span>
        </div>
        <div className="relative px-4 pt-3 pb-4">
          {/* Until the listing is written, grey bars hold its place so nothing jumps when it arrives. */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-x-4 top-3.5 flex flex-col gap-2.5 transition-opacity duration-300",
              written ? "opacity-0" : "opacity-100",
            )}
          >
            <span className="h-4 w-3/4 rounded-sm bg-paper" />
            <span className="h-3 w-1/2 rounded-sm bg-paper" />
            <span className="mt-4 h-3 w-2/3 rounded-sm bg-paper" />
            <span className="h-3 w-3/5 rounded-sm bg-paper" />
            <span className="h-3 w-1/2 rounded-sm bg-paper" />
          </div>
          <div
            className={cn(
              "transition-opacity duration-300",
              written ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="grid">
              {LISTING.map((l, i) => (
                <p
                  key={l.lang}
                  aria-hidden={i !== lang}
                  className={cn(
                    "font-display text-[19px] leading-tight text-ink transition-opacity duration-300 [grid-area:1/1]",
                    i === lang ? "opacity-100" : "opacity-0",
                  )}
                >
                  {l.title}
                </p>
              ))}
            </div>
            <div className="num mt-1.5 flex items-baseline justify-between text-[12px] text-ink-muted">
              <span className="grid">
                {LISTING.map((l, i) => (
                  <span
                    key={l.lang}
                    aria-hidden={i !== lang}
                    className={cn(
                      "transition-opacity duration-300 [grid-area:1/1]",
                      i === lang ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {l.detail}
                  </span>
                ))}
              </span>
              <span className="text-[14px] text-ink">€24.00</span>
            </div>
            <ul className="mt-3 flex flex-col border-t border-border pt-2.5">
              {CLAIMS.map((c, i) => (
                <li
                  key={c.text}
                  className={cn(
                    "flex flex-col py-1 transition-[opacity,translate] duration-300",
                    tick >= AT.claim(i) || still ? SHOW : HIDE,
                  )}
                >
                  <span className="text-[13px] text-ink">
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-brand align-middle"
                    />
                    {c.text}
                  </span>
                  <span className="num truncate pl-3 text-[10.5px] text-ink-muted">
                    {c.source}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
      {tiles.length > 0 ? (
        <ul
          aria-label="Published in the same import"
          className="grid grid-cols-3 gap-2"
        >
          {tiles.map((t, i) => (
            <li
              key={t.href}
              className={cn(
                "transition-[opacity,translate] duration-500 ease-out",
                published ? SHOW : "translate-y-1 opacity-35",
              )}
              style={{ transitionDelay: published ? `${i * 90}ms` : "0ms" }}
            >
              <Link
                href={t.href}
                className="block overflow-hidden rounded-md bg-card ring-1 ring-border focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <span className="relative block aspect-square bg-paper">
                  <Image
                    src={t.src}
                    alt={t.title}
                    fill
                    sizes="110px"
                    className="object-cover"
                  />
                </span>
                <span className="num block truncate px-1.5 pt-1 text-[10.5px] text-ink">
                  {t.title}
                </span>
                <span className="num block px-1.5 pb-1.5 text-[10.5px] text-ink-muted">
                  {t.price}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
