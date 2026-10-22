"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { api } from "@/lib/client/api";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="hidden text-paper/70 md:inline">{user.name}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/api/auth/logout", { method: "POST" });
          } finally {
            router.push("/login");
            router.refresh();
          }
        }}
        className="h-7 cursor-pointer rounded-sm border border-paper/20 px-2 text-xs text-paper/80 transition-colors hover:border-paper/50 hover:text-paper disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
