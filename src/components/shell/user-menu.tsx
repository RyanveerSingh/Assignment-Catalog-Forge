"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { cn } from "cn";
import type { SessionUser } from "@/lib/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client/api";

/** Up to two initials from a name ("Demo Merchant" → "DM"); "?" when the name is blank. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const out = `${first}${last}`.toLocaleUpperCase();
  return out || "?";
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold tracking-wide text-paper", className)}>
      {initialsOf(name)}
    </span>
  );
}

/** The person at the bottom of the rail (or the avatar in the top bar when `compact`): name, email, sign out. */
export function UserMenu({ user, compact = false }: { user: SessionUser; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-2xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
          compact ? "rounded-full p-0.5 hover:bg-surface-2" : "w-full px-2.5 py-2 hover:bg-surface-2/70 aria-expanded:bg-surface-2/70",
        )}
      >
        <Avatar name={user.name} className={compact ? "size-9" : undefined} />
        {compact ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-ink">{user.name}</span>
              <span className="truncate text-[11px] text-ink-muted">{user.email}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} sideOffset={8} className="w-[232px] rounded-2xl p-1.5 shadow-[var(--shadow-pop)]">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="text-[13px] font-semibold text-ink">{user.name}</span>
          <span className="truncate text-[11px] font-normal text-ink-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onClick={() => void signOut()} className="h-10 cursor-pointer gap-2.5 rounded-xl px-2 text-[13px]">
          <LogOutIcon aria-hidden />
          {busy ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
