import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { CONTAINER, LogoMark } from "./site-chrome";

const LINK = "rounded-sm text-sm text-white/60 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

/** An ink band: the one way in, then the few links that matter. */
export function SiteFooter({ dashboardHref = null }: { dashboardHref?: string | null }) {
  return (
    <footer className="bg-ink text-white">
      <div className={cn(CONTAINER, "max-w-[1320px] pt-14 pb-8 md:pt-20")}>
        <Link href={dashboardHref ?? DEMO_HREF} className="group inline-flex flex-wrap items-baseline gap-x-4 focus-visible:outline-none">
          <span className="font-display text-[40px] leading-[0.95] tracking-[-0.035em] md:text-[88px]">{dashboardHref ? "Open your dashboard" : "Try it with the demo"}</span>
          <ArrowRightIcon aria-hidden className="size-8 text-brand transition-transform duration-300 group-hover:translate-x-2 group-focus-visible:translate-x-2 md:size-14" />
        </Link>
        <div className="mt-14 flex flex-col gap-5 border-t border-white/15 pt-6 md:mt-20 md:flex-row md:items-center md:justify-between">
          <span className="flex items-center gap-2.5">
            <LogoMark size={22} />
            <span className="font-display text-[15px]">CatalogForge</span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href={SHOP_HREF} className={LINK}>
              The demo shop
            </Link>
            <Link href="/#how" className={LINK}>
              How it stays right
            </Link>
            <Link href="/#numbers" className={LINK}>
              Numbers
            </Link>
            <Link href="/login" className={LINK}>
              Sign in
            </Link>
          </nav>
          <span className="num text-[11px] text-white/40">Figures measured on the sample files in the repository.</span>
        </div>
      </div>
    </footer>
  );
}
