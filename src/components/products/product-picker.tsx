"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from our own blob route */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { ImageIcon, LinkIcon, SearchIcon } from "lucide-react";
import { StatusBadge } from "@/components/ext/status-badge";
import { TAP_TARGET } from "@/components/ext/surfaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { api, storeApi } from "@/lib/client/api";
import type { PickedProduct } from "./photo-tray-types";
import { imageUrl, type ProductListItem, type ProductListResponse } from "./types";

const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 8;

function productLabel(p: Pick<ProductListItem, "title" | "handle">): string {
  return p.title ?? p.handle;
}

/**
 * Compact product search for "assign this photo to…": title, handle, key or SKU, same index the table uses.
 * Arrow keys move from the search box into the results and along them; Enter picks; Escape closes.
 */
export function ProductPicker({ storeSlug, disabled, onPick, label = "Assign", iconOnly = false, className }: { storeSlug: string; disabled?: boolean; onPick: (product: PickedProduct) => void; label?: string; iconOnly?: boolean; className?: string }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const search = useCallback(
    async (q: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams({ limit: String(RESULT_LIMIT), sort: q ? "title" : "updatedAt", dir: q ? "asc" : "desc" });
      if (q) sp.set("q", q);
      try {
        const res = await api<ProductListResponse>(`${storeApi(storeSlug)}/products?${sp.toString()}`);
        if (seq !== requestSeq.current) return;
        setItems(res.items);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Could not search products");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [storeSlug],
  );

  // Fresh list every time the picker opens; the query is debounced while it is open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(query.trim()), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [open, query, search]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setItems([]);
      setError(null);
    }
  };

  const optionButtons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
  const focusOption = (index: number) => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    const i = ((index % buttons.length) + buttons.length) % buttons.length;
    buttons[i]?.focus();
  };
  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const buttons = optionButtons();
    const current = buttons.findIndex((b) => b === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (current <= 0) listRef.current?.parentElement?.querySelector<HTMLInputElement>("input")?.focus();
      else focusOption(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusOption(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusOption(buttons.length - 1);
    }
  };

  const pick = (p: ProductListItem) => {
    onPick({ id: p.id, title: p.title, handle: p.handle });
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<Button type="button" variant="outline" size={iconOnly ? "icon-sm" : "sm"} disabled={disabled} aria-label={iconOnly ? label : undefined} className={cn("cursor-pointer", TAP_TARGET, className)} />}>
        <LinkIcon data-icon={iconOnly ? undefined : "inline-start"} />
        {iconOnly ? null : label}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 gap-2 p-2">
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-muted" />
          <Input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusOption(0);
              }
            }}
            aria-label="Search products by title, handle, key or SKU"
            aria-controls={listId}
            placeholder="Title, handle, key or SKU…"
            className="h-9 bg-card pl-7 text-sm md:text-sm"
          />
        </div>
        {error ? (
          <div className="flex items-center justify-between gap-2 px-1 text-xs text-destructive" role="alert">
            <span>{error}</span>
            <Button type="button" variant="ghost" size="xs" onClick={() => void search(query.trim())} className="cursor-pointer">
              Retry
            </Button>
          </div>
        ) : null}
        <ul id={listId} ref={listRef} onKeyDown={onListKeyDown} aria-label="Matching products" aria-busy={loading} className={cn("flex max-h-72 flex-col overflow-y-auto", loading && items.length > 0 && "opacity-60")}>
          {loading && items.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex h-11 items-center gap-2 px-1" aria-hidden>
                  <Skeleton className="size-8 rounded-none" />
                  <Skeleton className="h-3.5 flex-1" />
                </li>
              ))
            : items.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex h-11 w-full cursor-pointer items-center gap-2 px-1 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
                    {p.thumbBlobId ? (
                      <img src={imageUrl(storeSlug, p.thumbBlobId)} alt="" width={32} height={32} loading="lazy" className="size-8 shrink-0 border border-border object-cover" />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center border border-dashed border-border text-ink-muted" aria-hidden>
                        <ImageIcon className="size-3.5" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-[13px] text-ink", !p.title && "italic text-ink-muted")}>{productLabel(p)}</span>
                      <span className="truncate num text-[10px] text-ink-muted">
                        {p.handle} · {p.photoCount} {p.photoCount === 1 ? "photo" : "photos"}
                      </span>
                    </span>
                    <StatusBadge status={p.status} className="shrink-0" />
                  </button>
                </li>
              ))}
          {!loading && !error && items.length === 0 ? <li className="px-1 py-3 text-center text-xs text-ink-muted">{query ? "No products match." : "No products yet."}</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
