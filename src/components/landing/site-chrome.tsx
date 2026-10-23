import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_HREF } from "./landing-links";
import { NavMenu } from "./nav-menu";

export const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 md:px-6";

/** The page's three sections and the shop. */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/#shop", label: "Shop" },
  { href: "/#how", label: "How it works" },
  { href: "/#numbers", label: "Numbers" },
];

/** An orange tile with three sheet rows narrowing into a dot: rows in, a product out. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
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

/** The one ink action on every page: into the demo for a visitor, back to their store for a merchant. */
export function PrimaryCta({ dashboardHref, className, label }: { dashboardHref: string | null; className?: string; label?: string }) {
  return (
    <Link href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "lg" }), "rounded-md px-4", className)}>
      {label ?? (dashboardHref ? "Open dashboard" : "Open the demo")}
      <ArrowRightIcon aria-hidden className="hidden size-4 md:block" />
    </Link>
  );
}

interface HeaderProps {
  /** Show a sign-in link (the login page itself hides it). */
  signIn?: boolean;
  /** A signed-in merchant's dashboard; replaces the sign-in link with a way back in. */
  dashboardHref?: string | null;
}

/** A plain sticky bar: opaque white with a hairline, so nothing is blurred or composited behind it while scrolling. */
export function SiteHeader({ signIn = true, dashboardHref = null }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className={cn(CONTAINER, "flex h-14 max-w-[1320px] items-center justify-between gap-3 md:h-16")}>
        <Wordmark />
        <div className="flex items-center gap-1">
          <nav aria-label="Site" className="mr-2 hidden items-center lg:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                {l.label}
              </Link>
            ))}
            {signIn && !dashboardHref ? (
              <Link href="/login" className="rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                Sign in
              </Link>
            ) : null}
          </nav>
          <PrimaryCta dashboardHref={dashboardHref} className="h-9 px-3 text-[13px] md:h-10 md:px-4 md:text-sm" />
          <NavMenu links={NAV_LINKS} dashboardHref={dashboardHref} signIn={signIn} />
        </div>
      </div>
    </header>
  );
}
