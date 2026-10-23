"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { SessionUser, StoreAccess } from "@/lib/auth";
import { settle } from "@/components/ext/motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { BottomTabs } from "./bottom-tabs";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** The rail's width; the content column's `lg:pl-[240px]` matches it. */
const SIDEBAR_WIDTH = 240;

/**
 * The dashboard frame: a white rail on the left from lg up (a sheet on phones), the slim top bar,
 * the page on the ice ground and, on phones, the tab bar. The page content is keyed by pathname so
 * every route change fades and rises in (250 ms, transform and opacity only); search-param changes
 * keep the same key and never replay it.
 */
export function AppShell({ user, store, stores, demoMode, children }: { user: SessionUser; store: StoreAccess; stores: StoreAccess[]; demoMode: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // globals.css asks for smooth scrolling; Next wants the html element to say so too, or it warns on every route change.
  useEffect(() => {
    document.documentElement.dataset.scrollBehavior = "smooth";
  }, []);
  return (
    <div className="min-h-dvh bg-paper">
      <aside className="fixed inset-y-0 left-0 z-40 hidden border-r border-border/80 bg-card lg:block" style={{ width: SIDEBAR_WIDTH }}>
        <Sidebar user={user} store={store} stores={stores} idPrefix="rail" />
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" showCloseButton className="w-[286px] gap-0 border-0 p-0 shadow-[var(--shadow-pop)] data-[side=left]:w-[286px] data-[side=left]:rounded-r-3xl data-[side=left]:sm:max-w-[286px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Sections of the dashboard</SheetDescription>
          <Sidebar user={user} store={store} stores={stores} idPrefix="sheet" onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-dvh flex-col lg:pl-[240px]">
        <TopBar user={user} store={store} demoMode={demoMode} onOpenMenu={() => setMenuOpen(true)} />
        <motion.main key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.25)} className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-6 lg:pb-10">
          {children}
        </motion.main>
        <footer className="hidden px-6 pb-6 text-center text-[11px] text-ink-muted lg:block">CatalogForge · prices and SKUs are never written by the model · every claim links to its source row</footer>
      </div>
      <BottomTabs storeSlug={store.slug} />
    </div>
  );
}
