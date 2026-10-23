import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

const CTA = "h-11 cursor-pointer px-5 text-sm";

export function LandingCta() {
  return (
    <section aria-labelledby="cta-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-16 md:py-24")}>
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 id="cta-heading" className="font-display text-3xl leading-tight text-ink md:text-5xl">
            See it with your own sheet.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-muted">The demo account has sample sheets ready to drop in, from ten clean rows to ten thousand messy ones. Or bring the file your supplier just sent.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login?demo=1" className={cn(buttonVariants({ size: "lg" }), CTA, "bg-brand text-brand-foreground hover:bg-brand/90")}>
              Open the demo
            </Link>
            <Link href="/store/demo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), CTA)}>
              Browse the shop
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
