import { cn } from "cn";
import type { ShopTile } from "./hero-listing";
import { HeroSheet } from "./hero-sheet";
import { CONTAINER } from "./site-chrome";

const VASE = /vase/i;

/** The first screen is the product at work; the heading exists for screen readers and search only. */
export function LandingHero({ tiles }: { tiles: readonly ShopTile[] }) {
  const neighbours = tiles.filter((t) => !VASE.test(t.title)).slice(0, 3);
  return (
    <section aria-labelledby="hero-heading" className="border-b border-border pt-6 pb-10 md:pt-10 md:pb-14">
      <h1 id="hero-heading" className="sr-only">
        CatalogForge turns the spreadsheet a supplier sent into a cleaned, written and translated shop catalogue
      </h1>
      <div className={cn(CONTAINER, "max-w-[1320px]")}>
        <HeroSheet tiles={neighbours} />
      </div>
    </section>
  );
}
