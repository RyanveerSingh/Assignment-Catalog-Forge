import Link from "next/link";
import { cn } from "cn";

/** Shared by the landing and login pages: the wordmark, a one-row header and the footer line the app also carries. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("font-display text-2xl leading-none tracking-tight text-ink", className)}>
      Catalog<span className="text-brand">Forge</span>
    </Link>
  );
}

export const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 md:px-6";

const LINK = "rounded-sm text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

export function SiteHeader({ signIn = true }: { signIn?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className={cn(CONTAINER, "flex h-14 items-center justify-between gap-4")}>
        <Wordmark />
        <nav aria-label="Site" className="flex items-center gap-5">
          <Link href="/store/demo" className={LINK}>
            See the shop
          </Link>
          {signIn ? (
            <Link href="/login" className={LINK}>
              Sign in
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className={cn(CONTAINER, "flex flex-col gap-2 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between")}>
        <span>CatalogForge · prices and SKUs are never written by the model · every claim links to its source row</span>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/login?demo=1" className={LINK}>
            Open the demo
          </Link>
          <Link href="/store/demo" className={LINK}>
            See the shop
          </Link>
        </nav>
      </div>
    </footer>
  );
}
