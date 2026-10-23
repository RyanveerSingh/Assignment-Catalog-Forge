import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeadline } from "./hero-headline";
import { HeroTransform } from "./hero-transform";
import { CONTAINER } from "./site-chrome";

const CTA = "h-11 cursor-pointer px-5 text-sm";

export function LandingHero({ dashboardHref }: { dashboardHref: string | null }) {
  return (
    <section aria-labelledby="hero-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "grid gap-12 py-14 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center lg:gap-8 lg:py-20")}>
        <div>
          <p className="mb-4 text-[11px] font-medium tracking-[0.18em] text-brand uppercase">For shops that sell what their suppliers send</p>
          <h1 id="hero-heading" className="font-display max-w-xl text-[2.6rem] leading-[1.02] text-ink sm:text-5xl lg:text-[3.3rem]">
            <HeroHeadline />
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted md:text-lg">
            Upload the spreadsheet your supplier sent, with any photos. Prices and SKUs are fixed by code, each listing is written from your rows and translated into German and French, and every claim shows the cell it came from. Review, approve, and it is live in your shop.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={dashboardHref ?? "/login?demo=1"} className={cn(buttonVariants({ size: "lg" }), CTA, "bg-brand text-brand-foreground hover:bg-brand/90")}>
              {dashboardHref ? "Open your dashboard" : "Try it with a sample sheet"}
            </Link>
            <Link href="/store/demo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), CTA)}>
              See the shop it built
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-muted">CSV, Excel, a SQL dump or a Google Sheets link · free demo account, nothing to install</p>
        </div>
        <HeroTransform />
      </div>
    </section>
  );
}
