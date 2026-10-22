"use client";

import { useRouter } from "next/navigation";
import type { StoreAccess } from "@/lib/auth";

export function StoreSwitcher({ current, stores }: { current: StoreAccess; stores: StoreAccess[] }) {
  const router = useRouter();
  if (stores.length <= 1) return <span className="rounded-sm bg-paper/10 px-2 py-1 text-xs text-paper/80">{current.name}</span>;
  return (
    <label className="flex items-center gap-2 text-xs text-paper/70">
      <span className="sr-only">Store</span>
      <select
        aria-label="Switch store"
        value={current.slug}
        onChange={(e) => router.push(`/app/${e.target.value}/upload`)}
        className="h-7 cursor-pointer rounded-sm border border-paper/20 bg-paper/10 px-2 text-xs text-paper outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.slug} className="text-ink">
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
