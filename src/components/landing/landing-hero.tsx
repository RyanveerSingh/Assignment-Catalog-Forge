import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeadline } from "./hero-headline";
import { HeroObject } from "./hero-object";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { PressLink } from "./press";
import { Reveal } from "./reveal";
import { TornPage } from "./torn-edge";

/** Left edge of the site container at any width, so the text column lines up with the header. */
const ALIGN_LEFT = "px-4 md:px-6 lg:pl-[max(24px,calc((100vw-1200px)/2+24px))]";

/**
 * A full-height split that starts at the very top of the page, under the floating header. The left is
 * the supplier's sheet, torn away on a slant; under it is the shop CatalogForge published from that
 * sheet (a capture of the demo store). On phones the shop sits under the text with the tear across it.
 */
export function LandingHero({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="relative">
      {/* Pulled up by the header's height so the shop runs behind it to the top edge of the window. */}
      <div className="relative -mt-[72px] md:-mt-[76px] lg:min-h-dvh">
        {/* The tear narrows towards the bottom, where the shop's own headline sits, so that stays readable. */}
        <div aria-hidden className="absolute inset-y-0 right-0 left-[53%] hidden lg:block">
          <Image src="/landing/hero-shop.webp" alt="" fill priority sizes="47vw" className="object-cover object-left-top" />
        </div>
        <TornPage direction="vertical" className="hidden lg:block" />
        <div className={cn(ALIGN_LEFT, "relative z-10 flex flex-col justify-center pt-[120px] pb-12 lg:min-h-dvh lg:w-[52%] lg:pt-[140px] lg:pr-10 lg:pb-20")}>
          <h1 id="hero-heading" className="font-serif text-[52px] leading-[0.98] tracking-[-0.02em] text-ink sm:text-[72px] md:text-[84px] xl:text-[100px]">
            <HeroHeadline />
          </h1>
          <Reveal delay={0.45} className="mt-8 max-w-[500px]">
            <p className="text-[17px] leading-relaxed text-ink-muted md:text-lg">Prices and units fixed in code. Every claim traced to its cell. English, German and French from one upload.</p>
          </Reveal>
          <Reveal delay={0.55} className="mt-9 flex flex-wrap items-center gap-3">
            <PressLink magnetic href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
              {dashboardHref ? "Open dashboard" : "Open the demo"}
              <ArrowRightIcon aria-hidden className="size-4" />
            </PressLink>
            <PressLink href={SHOP_HREF} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-full px-5 text-ink-muted hover:bg-brand-soft/60 hover:text-ink")}>
              See the shop it built
            </PressLink>
          </Reveal>
        </div>
        <div className="relative h-[560px] sm:h-[680px] lg:hidden">
          <Image src="/landing/hero-shop.webp" alt="" fill sizes="100vw" className="object-cover object-top" />
          <TornPage direction="horizontal" />
        </div>
        <p className="sr-only">Under the torn page: the demo shop CatalogForge published from one supplier sheet.</p>
      </div>
      <HeroObject />
    </section>
  );
}
