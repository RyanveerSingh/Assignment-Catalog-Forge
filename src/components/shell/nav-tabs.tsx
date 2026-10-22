"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { key: "upload", label: "Upload" },
  { key: "products", label: "Products" },
  { key: "storefront", label: "Storefront" },
  { key: "metrics", label: "Metrics" },
  { key: "settings", label: "Settings" },
] as const;

export function NavTabs({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto no-scrollbar">
      {TABS.map((t) => {
        const href = `/app/${storeSlug}/${t.key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              active ? "text-paper" : "text-paper/60 hover:text-paper",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-brand after:transition-transform",
              active ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-50",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
