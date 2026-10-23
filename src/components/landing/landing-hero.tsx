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
        <h1 id="hero-heading" className="font-display max-w-[1000px] text-[38px] leading-[1.04] text-balance text-ink sm:text-[54px] md:text-[60px] lg:text-[66px] xl:text-[72px]">
          <HeroHeadline />
        </h1>
        <Reveal delay={0.45} className="mt-6 max-w-[720px]">
          <p className="text-base leading-relaxed text-balance text-ink-muted sm:text-lg">
            Upload the spreadsheet your supplier sent, with any photos. Prices and SKUs are fixed by code, each listing is written from your rows and translated into German and French, and every claim shows the cell it came from.
          </p>
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
        <Reveal delay={0.65}>
          <p className="mt-5 text-xs text-ink-muted">CSV, Excel, a SQL dump or a Google Sheets link · free demo account, nothing to install</p>
        </Reveal>
      </div>
      <HeroObject />
    </section>
  );
}
