import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeadline } from "./hero-headline";
import { HeroObject } from "./hero-object";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { PressLink } from "./press";
import { Reveal } from "./reveal";
import { TornEdge } from "./torn-edge";

/** Left edge of the site container at any width, so the text column lines up with the header. */
const ALIGN_LEFT = "px-4 md:px-6 lg:pr-16 lg:pl-[max(24px,calc((100vw-1200px)/2+24px))]";

/**
 * A full-height 60/40 split that starts at the very top of the page, under the floating header: the
 * promise on the left, a real product photo from the sample import on the right, joined by a torn page
 * edge (vertical on wide screens, along the top of the photo on phones). The hero object below shows
 * what the import made of one row.
 */
export function LandingHero({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="relative">
      {/* Pulled up by the header's height so the photo runs behind it to the top edge of the window. */}
      <div className="-mt-[72px] grid md:-mt-[76px] lg:min-h-dvh lg:grid-cols-[3fr_2fr]">
        <div className={cn(ALIGN_LEFT, "relative z-10 flex flex-col justify-center pt-[120px] pb-12 lg:pt-[140px] lg:pb-20")}>
          <h1 id="hero-heading" className="font-serif text-[52px] leading-[0.98] tracking-[-0.02em] text-ink sm:text-[72px] md:text-[84px] xl:text-[104px]">
            <HeroHeadline />
          </h1>
          <Reveal delay={0.45} className="mt-8 max-w-[520px]">
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
        <div className="relative h-[440px] sm:h-[520px] lg:h-auto">
          <Image src="/landing/hero-dog.webp" alt="A curly-haired dog in an orange waxed coat, one of the product photos from the sample supplier sheet" fill priority sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover object-[45%_center]" />
          <div className="hidden lg:block">
            <TornEdge direction="vertical" />
          </div>
          <div className="lg:hidden">
            <TornEdge direction="horizontal" />
          </div>
          {/* The photo is CC BY-SA 4.0, which requires the credit. */}
          <a href="https://commons.wikimedia.org/wiki/File:Westiepoo_wearing_coat.jpg" className="absolute right-3 bottom-3 z-10 rounded-sm bg-ink/55 px-1.5 py-0.5 text-[10px] text-white/85 hover:text-white">
            Photo: Bassschlüssel, CC BY-SA 4.0
          </a>
        </div>
      </div>
      <HeroObject />
    </section>
  );
}
