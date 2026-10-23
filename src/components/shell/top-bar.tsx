"use client";

import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import type { SessionUser, StoreAccess } from "@/lib/auth";
import { Chip } from "@/components/ext/chip";
import { GlobalSearch } from "./global-search";
import { pageMeta } from "./nav-items";
import { UserMenu } from "./user-menu";

/** The slim bar above the page: menu button on phones, section and title, search, the demo chip and the person. */
export function TopBar({ user, store, demoMode, onOpenMenu }: { user: SessionUser; store: StoreAccess; demoMode: boolean; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { item, title } = pageMeta(pathname, store.slug);
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand lg:hidden">
          <MenuIcon className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">{item?.eyebrow ?? "CatalogForge"}</div>
          <div className="truncate font-display text-[15px] leading-tight text-ink">{title || store.name}</div>
        </div>
        <GlobalSearch storeSlug={store.slug} className="hidden w-64 md:block lg:w-80" />
        {demoMode ? (
          <Chip tone="brand" dot className="hidden sm:inline-flex" title="No AI key is set, so a built-in demo writer drafts the listings. Add a key under Settings to use the real models.">
            Demo mode
          </Chip>
        ) : null}
        <UserMenu user={user} compact />
      </div>
    </header>
  );
}
