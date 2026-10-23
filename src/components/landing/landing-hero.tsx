import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { CONTAINER } from "./site-chrome";

const CTA = "h-11 cursor-pointer px-5 text-sm";

export function LandingHero() {
  return (
    <section aria-labelledby="hero-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-14 md:py-24")}>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">For merchants who sell what their suppliers send</p>
        <h1 id="hero-heading" className="font-display max-w-4xl text-[2.5rem] leading-[1.05] text-ink sm:text-5xl md:text-6xl">
          Messy supplier sheets in.
          <br className="hidden sm:block" /> A shop-ready catalogue out.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-muted md:text-lg">
          Drop in the spreadsheet your supplier sent, with any photos, and get back cleaned prices and SKUs, written and translated listings, and the exact cell behind every claim, ready to review and publish.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login?demo=1" className={cn(buttonVariants({ size: "lg" }), CTA, "bg-brand text-brand-foreground hover:bg-brand/90")}>
            Open the demo
          </Link>
          <Link href="/store/demo-new12" className={cn(buttonVariants({ variant: "outline", size: "lg" }), CTA)}>
            See the storefront
          </Link>
        </div>
      </div>
    </section>
  );
}
