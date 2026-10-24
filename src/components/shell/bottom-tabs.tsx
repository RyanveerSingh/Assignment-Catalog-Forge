"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { NAV_ITEMS, navHref } from "./nav-items";

/** The phone's tab bar: five icons with labels, the active one in the brand colour. Hidden from lg up where the rail takes over. */
export function BottomTabs({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="grid h-16 grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const href = navHref(storeSlug, item.key);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex">
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand active:scale-95", active ? "text-brand" : "text-ink-muted")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft")}>
                  <Icon className="size-[18px]" aria-hidden strokeWidth={active ? 2.2 : 1.9} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
