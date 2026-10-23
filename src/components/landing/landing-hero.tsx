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
const ALIGN_LEFT = "px-4 md:px-6 lg:pr-12 lg:pl-[max(24px,calc((100vw-1200px)/2+24px))]";

/**
 * A 60/40 split: the promise on the left, the supplier's own photo on the right, joined by a torn
 * paper edge (vertical on wide screens, along the top of the photo on phones). Below it, the hero
 * object shows what the import made of that photo's row.
 */
export function LandingHero({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden pt-8 md:pt-10">
      <div className="grid lg:min-h-[620px] lg:grid-cols-[3fr_2fr]">
        <div className={cn(ALIGN_LEFT, "relative z-10 flex flex-col justify-center py-10 lg:py-16")}>
          <h1 id="hero-heading" className="font-display text-[56px] leading-[0.92] tracking-[-0.045em] text-ink sm:text-[84px] md:text-[100px] xl:text-[124px]">
            <HeroHeadline />
          </h1>
          <Reveal delay={0.45} className="mt-7">
            <p className="num text-[13px] text-ink-muted sm:text-sm">Prices fixed by code · every claim cites its cell · English, German, French</p>
          </Reveal>
          <Reveal delay={0.55} className="mt-8 flex flex-wrap items-center gap-3">
            <PressLink magnetic href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
              {dashboardHref ? "Open dashboard" : "Open the demo"}
              <ArrowRightIcon aria-hidden className="size-4" />
            </PressLink>
            <PressLink href={SHOP_HREF} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-full px-5 text-ink-muted hover:bg-brand-soft/60 hover:text-ink")}>
              See the shop it built
            </PressLink>
          </Reveal>
        </div>
        <div className="relative h-[380px] sm:h-[460px] lg:h-auto">
          <Image src="/landing/hero-vase.jpg" alt="Sage-green hand-turned stoneware vase, the photo a supplier sent with their sheet" fill priority sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          <div className="hidden lg:block">
            <TornEdge direction="vertical" />
          </div>
          <div className="lg:hidden">
            <TornEdge direction="horizontal" />
          </div>
        </div>
      </div>
      <HeroObject />
    </section>
  );
}
