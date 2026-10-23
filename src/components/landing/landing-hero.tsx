import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeadline } from "./hero-headline";
import { HeroObject } from "./hero-object";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { PressLink } from "./press";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

export function LandingHero({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden pt-12 md:pt-16">
      <div className={cn(CONTAINER, "relative z-10 flex flex-col items-center text-center")}>
        <h1 id="hero-heading" className="font-display max-w-[1100px] text-[56px] leading-[0.92] tracking-[-0.045em] text-balance text-ink sm:text-[84px] md:text-[104px] lg:text-[128px]">
          <HeroHeadline />
        </h1>
        <Reveal delay={0.45} className="mt-6 max-w-[720px]">
          <p className="num text-[13px] text-ink-muted sm:text-sm">Prices fixed by code · every claim cites its cell · English, German, French</p>
        </Reveal>
        <Reveal delay={0.55} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PressLink magnetic href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
            {dashboardHref ? "Open dashboard" : "Open the demo"}
            <ArrowRightIcon aria-hidden className="size-4" />
          </PressLink>
          <PressLink href={SHOP_HREF} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-full px-5 text-ink-muted hover:bg-brand-soft/60 hover:text-ink")}>
            See the shop it built
          </PressLink>
        </Reveal>
      </div>
      <HeroObject />
    </section>
  );
}
