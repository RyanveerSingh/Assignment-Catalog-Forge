import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { NavMenu } from "./nav-menu";
import { PressLink } from "./press";

export const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 md:px-6";

/** The in-page sections and the shop, in the order the page tells its story. */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#numbers", label: "Numbers" },
  { href: SHOP_HREF, label: "Shop" },
];

/** A blue tile with three sheet rows narrowing into a dot: rows in, a product out. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M9 10.5h14M9 16h9.5M9 21.5h5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22.5" cy="21.5" r="2.6" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", className)} aria-label="CatalogForge home">
      <LogoMark />
      <span className="font-display text-[17px] leading-none tracking-[-0.02em] text-ink md:text-[19px]">CatalogForge</span>
    </Link>
  );
}

/** The one blue action on every page: into the demo for a visitor, back to their store for a merchant. */
export function PrimaryCta({ dashboardHref, className, label }: { dashboardHref: string | null; className?: string; label?: string }) {
  return (
    <PressLink href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5", className)}>
      {label ?? (dashboardHref ? "Open dashboard" : "Open the demo")}
      <ArrowRightIcon aria-hidden className="hidden size-4 md:block" />
    </PressLink>
  );
}

interface HeaderProps {
  /** Show a sign-in link (the login page itself hides it). */
  signIn?: boolean;
  /** A signed-in merchant's dashboard; replaces the sign-in link with a way back in. */
  dashboardHref?: string | null;
}

/** A white bar floating 16 px below the top edge, sticky, with the wordmark, four links and the blue pill. */
export function SiteHeader({ signIn = true, dashboardHref = null }: HeaderProps) {
  return (
    <header className="sticky top-3 z-40 px-3 pt-3 md:top-4 md:px-6 md:pt-4">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-2 rounded-2xl bg-card/90 pr-1.5 pl-3 shadow-[var(--shadow-pop)] ring-1 ring-border/70 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 md:gap-3 md:pr-2 md:pl-5">
        <Wordmark />
        <nav aria-label="Site" className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          {signIn && !dashboardHref ? (
            <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none lg:inline-flex">
              Sign in
            </Link>
          ) : null}
          <PrimaryCta dashboardHref={dashboardHref} className="h-10 px-3.5 text-[13px] md:h-11 md:px-5 md:text-[15px]" />
          <NavMenu links={NAV_LINKS} dashboardHref={dashboardHref} signIn={signIn} />
        </div>
      </div>
    </header>
  );
}
