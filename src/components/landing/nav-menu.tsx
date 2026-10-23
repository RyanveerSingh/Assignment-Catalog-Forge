"use client";

import Link from "next/link";
import { ArrowRightIcon, MenuIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DEMO_HREF } from "./landing-links";

interface Props {
  links: ReadonlyArray<{ href: string; label: string }>;
  dashboardHref: string | null;
  signIn: boolean;
}

/** The phone menu: a button in the floating bar that opens a sheet from the top with the same links. */
export function NavMenu({ links, dashboardHref, signIn }: Props) {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none lg:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </SheetTrigger>
      <SheetContent side="top" className="border-0 border-b border-border bg-card">
        <div className="px-5 pt-5 pb-6">
          <SheetTitle className="font-display text-lg text-ink">Menu</SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
          <nav aria-label="Site" className="mt-2 flex flex-col">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={close} className="font-display flex items-center justify-between rounded-xl px-2 py-3 text-xl text-ink transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                {l.label}
                <ArrowRightIcon aria-hidden className="size-4 text-ink-muted" />
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link href={dashboardHref ?? DEMO_HREF} onClick={close} className={cn(buttonVariants({ size: "lg" }), "w-full rounded-md")}>
              {dashboardHref ? "Open dashboard" : "Open the demo"}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
            {signIn && !dashboardHref ? (
              <Link href="/login" onClick={close} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full rounded-md")}>
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
