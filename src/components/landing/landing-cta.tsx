import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRightIcon, ArrowUpRightIcon, BarChart3Icon, PackageIcon, StoreIcon, UploadIcon, WebhookIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { appLinks, SHOP_HREF } from "./landing-links";
import { PressLink } from "./press";
import { HoverWords } from "./hover-words";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

interface Props {
  dashboardHref: string | null;
}

/** The closing panel: one ask, centred, on ice. */
export function LandingCta({ dashboardHref }: Props) {
  return (
    <section aria-labelledby="cta-heading" className="py-6 md:py-10">
      <div className={CONTAINER}>
        <Reveal distance={20}>
          <div className="glow-center relative overflow-hidden rounded-[32px] bg-surface-2 px-6 py-16 text-center md:py-24">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/10" />
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/7" />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center">
              <h2 id="cta-heading" className="font-display text-[36px] leading-[1.05] text-balance text-ink sm:text-[44px] md:text-[56px]">
                <HoverWords text="See it with your own sheet" />
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-balance text-ink-muted md:text-lg">The demo account has sample sheets ready to drop in, from ten clean rows to ten thousand messy ones. Or bring the file your supplier just sent.</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <PressLink magnetic href={dashboardHref ?? appLinks(null).upload} className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
                  {dashboardHref ? "Open dashboard" : "Open the demo"}
                  <ArrowRightIcon aria-hidden className="size-4" />
                </PressLink>
                <PressLink href={SHOP_HREF} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "rounded-full px-5 text-ink-muted hover:bg-card hover:text-ink")}>
                  Browse the shop
                </PressLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Five doors into the product, the way netz closes with "Explore". */
export function LandingExplore({ dashboardHref }: Props) {
  const links = appLinks(dashboardHref);
  const CARDS: ReadonlyArray<{ icon: LucideIcon; title: string; text: string; href: string; external?: boolean }> = [
    { icon: UploadIcon, title: "Upload", text: "Drop a sheet and photos; watch every row move.", href: links.upload },
    { icon: PackageIcon, title: "Products", text: "Review what needs you, publish the rest.", href: links.products },
    { icon: StoreIcon, title: "Shop", text: "The storefront the demo import built.", href: links.shop, external: true },
    { icon: BarChart3Icon, title: "Metrics", text: "Accuracy, cost and time per import.", href: links.metrics },
    { icon: WebhookIcon, title: "API", text: "Signed webhooks and API keys for uploads and reads.", href: links.api },
  ];
  return (
    <section aria-labelledby="explore-heading" className="py-14 md:py-20">
      <div className={CONTAINER}>
        <Reveal>
          <h2 id="explore-heading" className="font-display text-2xl text-ink md:text-[28px]">
            <HoverWords text="Explore CatalogForge" />
          </h2>
        </Reveal>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CARDS.map(({ icon: Icon, title, text, href, external }, i) => (
            <li key={title} className="h-full">
              <Reveal delay={i * 0.05} className="h-full">
                <Link href={href} className="group flex h-full flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    {external ? <ArrowUpRightIcon aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> : <ArrowRightIcon aria-hidden className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />}
                  </div>
                  <h3 className="font-display text-base text-ink">{title}</h3>
                  <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
