"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import type { SessionUser, StoreAccess } from "@/lib/auth";
import { spring } from "@/components/ext/motion";
import { NAV_ITEMS, navHref } from "./nav-items";
import { StoreSwitcher } from "./store-switcher";
import { UserMenu } from "./user-menu";

/** The blue mark beside the wordmark: a sheet becoming a card, in one stroke. */
export function Logomark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-brand-foreground shadow-[0_6px_16px_-6px_rgba(36,87,245,0.7)]", className)}>
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h5M4 9h4M4 13h3" />
        <path d="M10 10h6M13 7l3 3-3 3" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" title="CatalogForge home" className={cn("inline-flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand", className)}>
      <Logomark />
      <span className="font-display text-[19px] leading-none tracking-tight text-ink">
        Catalog<span className="text-brand">Forge</span>
      </span>
    </Link>
  );
}

/**
 * The left rail: wordmark, store, the five sections and, at the bottom, the shop link and the person.
 * One blue-soft pill slides between sections (`layoutId`); `idPrefix` keeps the desktop rail and the
 * phone sheet from sharing a pill while both are mounted.
 */
export function Sidebar({ user, store, stores, idPrefix, onNavigate }: { user: SessionUser; store: StoreAccess; stores: StoreAccess[]; idPrefix: string; onNavigate?: () => void }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col gap-6 px-4 pt-5 pb-4">
      <div className="px-2">
        <Wordmark />
      </div>
      <StoreSwitcher current={store} stores={stores} />
      <nav aria-label="Sections" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const href = navHref(store.slug, item.key);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                active ? "text-brand" : "text-ink-muted hover:bg-surface-2/70 hover:text-ink",
              )}
            >
              {active ? (
                reduce ? (
                  <span aria-hidden className="absolute inset-0 rounded-xl bg-brand-soft" />
                ) : (
                  <motion.span aria-hidden layoutId={`${idPrefix}-nav-pill`} transition={spring(reduce)} className="absolute inset-0 rounded-xl bg-brand-soft" />
                )
              ) : null}
              <Icon className="relative size-[18px] shrink-0" aria-hidden strokeWidth={active ? 2.2 : 1.9} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <Link
          href={`/store/${store.slug}`}
          target="_blank"
          onClick={onNavigate}
          className="group flex h-11 cursor-pointer items-center justify-between rounded-xl bg-surface-2/80 px-3.5 text-[13px] font-medium text-ink outline-none transition-colors hover:bg-brand-soft hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
        >
          View shop
          <ArrowUpRightIcon className="size-4 text-ink-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
        </Link>
        <UserMenu user={user} />
      </div>
    </div>
  );
}
