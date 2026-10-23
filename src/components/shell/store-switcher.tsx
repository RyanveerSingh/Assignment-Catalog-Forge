"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "cn";
import type { StoreAccess } from "@/lib/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { storeInitial } from "./store-initial";

function Badge({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand font-display text-[15px] leading-none text-brand-foreground", className)}>
      {storeInitial(name)}
    </span>
  );
}

/** The current store with its initial badge; with several stores it opens a menu to switch. */
export function StoreSwitcher({ current, stores }: { current: StoreAccess; stores: StoreAccess[] }) {
  const router = useRouter();
  const face = (
    <>
      <Badge name={current.name} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[13px] font-semibold text-ink">{current.name}</span>
        <span className="truncate text-[11px] text-ink-muted">{current.role === "owner" ? "Owner" : "Editor"}</span>
      </span>
    </>
  );
  if (stores.length <= 1) {
    return <div className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-2.5 py-2">{face}</div>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch store"
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface-2/70 px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand aria-expanded:bg-surface-2"
      >
        {face}
        <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-[216px] rounded-2xl p-1.5 shadow-[var(--shadow-pop)]">
        <DropdownMenuLabel>Your stores</DropdownMenuLabel>
        {stores.map((s) => {
          const active = s.slug === current.slug;
          return (
            <DropdownMenuItem key={s.id} onClick={() => router.push(`/app/${s.slug}/upload`)} className="h-10 cursor-pointer gap-2.5 rounded-xl px-2">
              <Badge name={s.name} className="size-7 rounded-lg text-xs" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
              {active ? <CheckIcon className="size-4 text-brand" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
