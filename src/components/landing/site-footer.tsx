import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_HREF, SHOP_HREF } from "./landing-links";
import { CONTAINER, Wordmark } from "./site-chrome";

const LINK = "text-sm text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none rounded-sm";

interface Column {
  title: string;
  items: ReadonlyArray<{ label: string; href?: string }>;
}

/** Four columns: where the page's sections are, what the product reads and writes, and the ways in. */
function columns(dashboardHref: string | null): readonly Column[] {
  return [
    {
      title: "Product",
      items: [
        { label: "Everything it does", href: "/#product" },
        { label: "How it works", href: "/#how" },
        { label: "Try the cleaner", href: "/#try" },
        { label: "Numbers", href: "/#numbers" },
      ],
    },
    {
      title: "Reads",
      items: [{ label: "CSV, XLSX, XLS" }, { label: "mysqldump, pg_dump" }, { label: "Google Sheets link" }, { label: "ZIP, PNG, JPG, WEBP, GIF" }],
    },
    {
      title: "Writes",
      items: [{ label: "CSV and JSON" }, { label: "Shopify CSV" }, { label: "Signed webhooks" }, { label: "English, German, French" }],
    },
    {
      title: "Open",
      items: [
        { label: dashboardHref ? "Open dashboard" : "Open the demo", href: dashboardHref ?? DEMO_HREF },
        { label: "See the shop", href: SHOP_HREF },
        { label: "Sign in", href: "/login" },
      ],
    },
  ];
}

export function SiteFooter({ dashboardHref = null }: { dashboardHref?: string | null }) {
  return (
    <footer className="border-t border-border">
      <div className={cn(CONTAINER, "grid grid-cols-2 gap-x-6 gap-y-10 py-14 sm:grid-cols-4 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))] lg:gap-8")}>
        <div className="col-span-2 flex flex-col items-start gap-4 sm:col-span-4 lg:col-span-1">
          <Wordmark />
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">Messy supplier sheets in, a shop-ready catalogue in three languages out. Prices and SKUs are never written by the model; every claim links to its source row.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={dashboardHref ?? DEMO_HREF} className={cn(buttonVariants({ size: "sm" }), "rounded-full px-3.5")}>
              {dashboardHref ? "Open dashboard" : "Open the demo"}
            </Link>
            <Link href={SHOP_HREF} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-3.5")}>
              See the shop
            </Link>
          </div>
        </div>
        {columns(dashboardHref).map((col) => (
          <div key={col.title}>
            <h3 className="font-sans text-xs font-semibold tracking-[0.12em] text-ink uppercase">{col.title}</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.items.map((item) => (
                <li key={item.label}>
                  {item.href ? (
                    <Link href={item.href} className={LINK}>
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm text-ink-muted">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className={cn(CONTAINER, "flex flex-col gap-2 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between")}>
          <span>© 2026 CatalogForge. All rights reserved.</span>
          <span>Every figure on this page is measured on the sample files in the repository.</span>
        </div>
      </div>
    </footer>
  );
}
