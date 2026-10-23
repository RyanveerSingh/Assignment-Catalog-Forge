"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";

const TABS = [
  { key: "upload", label: "Upload" },
  { key: "products", label: "Products" },
  { key: "storefront", label: "Storefront" },
  { key: "metrics", label: "Metrics" },
  { key: "settings", label: "Settings" },
] as const;

const UNDERLINE = "absolute inset-x-3 bottom-0 h-0.5 bg-brand";

/** Section tabs. One shared underline glides to the active tab; hovering another tab shows a half-width hint beneath it. */
export function NavTabs({ storeSlug }: { storeSlug: string }) {
  const reduce = useReducedMotion();
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
              "relative cursor-pointer px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "text-paper" : "text-paper/60 hover:text-paper",
              !active && "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-brand/60 after:transition-transform hover:after:scale-x-50",
            )}
          >
            {t.label}
            {active ? reduce ? <span aria-hidden className={UNDERLINE} /> : <motion.span aria-hidden layoutId="nav-tab-underline" className={UNDERLINE} transition={{ type: "spring", stiffness: 520, damping: 42 }} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
