import Link from "next/link";
import type { SessionUser, StoreAccess } from "@/lib/auth";
import { NavTabs } from "./nav-tabs";
import { StoreSwitcher } from "./store-switcher";
import { UserMenu } from "./user-menu";

/** Ink masthead: wordmark, store switcher, section tabs. The one dark surface in the product. */
export function Masthead({ user, store, stores, demoMode }: { user: SessionUser; store: StoreAccess; stores: StoreAccess[]; demoMode: boolean }) {
  return (
    <header className="bg-ink text-paper">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 pt-3 md:px-6">
        <div className="flex items-center gap-4">
          <Link href={`/app/${store.slug}/upload`} className="font-display text-2xl leading-none tracking-tight text-paper">
            Catalog<span className="text-brand">Forge</span>
          </Link>
          <StoreSwitcher current={store} stores={stores} />
        </div>
        <div className="flex items-center gap-3">
          {demoMode ? (
            <span className="hidden items-center gap-1.5 rounded-sm bg-paper/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-paper/80 sm:inline-flex" title="No AI API key configured: a deterministic stand-in writes the listings">
              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
              Demo mode
            </span>
          ) : null}
          <Link href={`/store/${store.slug}`} target="_blank" className="hidden text-xs text-paper/70 underline-offset-4 hover:text-paper hover:underline sm:inline">
            View storefront ↗
          </Link>
          <UserMenu user={user} />
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 md:px-6">
        <NavTabs storeSlug={store.slug} />
      </div>
    </header>
  );
}
