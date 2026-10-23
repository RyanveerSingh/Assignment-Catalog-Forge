"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { ChevronRightIcon, ImagesIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatNumber } from "@/lib/format";
import { TRAY_PAGE_SIZE, type PickedProduct, type TrayPhoto, type TrayPhotoAction, type TrayPhotoListResponse, type TrayPhotoStatus } from "./photo-tray-types";
import { UnmatchedPhotoCard } from "./unmatched-photo-card";

interface Strip {
  items: TrayPhoto[];
  total: number;
  loading: boolean;
  error: string | null;
}

const EMPTY_STRIP: Strip = { items: [], total: 0, loading: false, error: null };

type Notice = { tone: "ok" | "error"; text: string };

function withoutId(items: TrayPhoto[], id: string): { items: TrayPhoto[]; index: number } {
  const index = items.findIndex((p) => p.id === id);
  return index === -1 ? { items, index } : { items: items.filter((p) => p.id !== id), index };
}

function insertAt(items: TrayPhoto[], index: number, photo: TrayPhoto): TrayPhoto[] {
  const at = index < 0 || index > items.length ? 0 : index;
  return [...items.slice(0, at), photo, ...items.slice(at)];
}

/**
 * Photos the matcher could not place (EC-C13), as a strip above the products table. Every action is
 * optimistic: the card moves at once and comes back with the error if the server disagrees.
 */
export function UnmatchedPhotos({ storeSlug, onAssigned }: { storeSlug: string; onAssigned?: (productId: string) => void }) {
  const headingId = useId();
  const [unmatched, setUnmatched] = useState<Strip>({ ...EMPTY_STRIP, loading: true });
  const [dismissed, setDismissed] = useState<Strip>(EMPTY_STRIP);
  const [showDismissed, setShowDismissed] = useState(false);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const seq = useRef<Record<TrayPhotoStatus, number>>({ unmatched: 0, rejected: 0 });

  const load = useCallback(
    async (status: TrayPhotoStatus, offset: number) => {
      const set = status === "unmatched" ? setUnmatched : setDismissed;
      const mySeq = ++seq.current[status];
      set((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await api<TrayPhotoListResponse>(`${storeApi(storeSlug)}/photos?status=${status}&limit=${TRAY_PAGE_SIZE}&offset=${offset}`);
        if (mySeq !== seq.current[status]) return;
        set((s) => ({ items: offset === 0 ? res.items : [...s.items, ...res.items.filter((p) => !s.items.some((q) => q.id === p.id))], total: res.total, loading: false, error: null }));
      } catch (err) {
        if (mySeq !== seq.current[status]) return;
        set((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Could not load photos" }));
      }
    },
    [storeSlug],
  );

  useEffect(() => {
    void load("unmatched", 0);
  }, [load]);
  useEffect(() => {
    if (showDismissed) void load("rejected", 0);
  }, [showDismissed, load]);

  // Collapsed by default when there is nothing to do; the merchant's own toggle wins after that.
  const open = userOpen ?? unmatched.total > 0;

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((s) => {
      const next = new Set(s);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  const setCardError = (id: string, message: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });

  const send = async (photo: TrayPhoto, action: TrayPhotoAction, revert: () => void, done: string) => {
    setBusy(photo.id, true);
    setCardError(photo.id, null);
    setNotice(null);
    try {
      await api(`${storeApi(storeSlug)}/photos/${photo.id}`, { method: "PATCH", json: action });
      setNotice({ tone: "ok", text: done });
      return true;
    } catch (err) {
      revert();
      const message = err instanceof ApiError ? err.message : "Action failed";
      setCardError(photo.id, message);
      setNotice({ tone: "error", text: `${photo.originalName}: ${message}` });
      return false;
    } finally {
      setBusy(photo.id, false);
    }
  };

  const assign = async (photo: TrayPhoto, product: PickedProduct) => {
    const from = photo.status === "rejected" ? setDismissed : setUnmatched;
    let index = 0;
    from((s) => {
      const r = withoutId(s.items, photo.id);
      index = r.index;
      return { ...s, items: r.items, total: Math.max(0, s.total - 1) };
    });
    const ok = await send(photo, { action: "assign", productId: product.id }, () => from((s) => ({ ...s, items: insertAt(s.items, index, photo), total: s.total + 1 })), `Assigned ${photo.originalName} to ${product.title ?? product.handle}.`);
    if (ok) onAssigned?.(product.id);
  };

  const dismiss = async (photo: TrayPhoto) => {
    let index = 0;
    setUnmatched((s) => {
      const r = withoutId(s.items, photo.id);
      index = r.index;
      return { ...s, items: r.items, total: Math.max(0, s.total - 1) };
    });
    const moved: TrayPhoto = { ...photo, status: "rejected", rejectReason: "dismissed by merchant" };
    setDismissed((s) => ({ ...s, items: showDismissed ? insertAt(s.items, 0, moved) : s.items, total: s.total + 1 }));
    await send(
      photo,
      { action: "dismiss" },
      () => {
        setUnmatched((s) => ({ ...s, items: insertAt(s.items, index, photo), total: s.total + 1 }));
        setDismissed((s) => ({ ...s, items: withoutId(s.items, photo.id).items, total: Math.max(0, s.total - 1) }));
      },
      `Dismissed ${photo.originalName}.`,
    );
  };

  const restore = async (photo: TrayPhoto) => {
    let index = 0;
    setDismissed((s) => {
      const r = withoutId(s.items, photo.id);
      index = r.index;
      return { ...s, items: r.items, total: Math.max(0, s.total - 1) };
    });
    const moved: TrayPhoto = { ...photo, status: "unmatched", rejectReason: null };
    setUnmatched((s) => ({ ...s, items: insertAt(s.items, 0, moved), total: s.total + 1 }));
    await send(
      photo,
      { action: "restore" },
      () => {
        setDismissed((s) => ({ ...s, items: insertAt(s.items, index, photo), total: s.total + 1 }));
        setUnmatched((s) => ({ ...s, items: withoutId(s.items, photo.id).items, total: Math.max(0, s.total - 1) }));
      },
      `Restored ${photo.originalName} to the tray.`,
    );
  };

  const refresh = () => {
    setNotice(null);
    void load("unmatched", 0);
    if (showDismissed) void load("rejected", 0);
  };

  const renderStrip = (strip: Strip, status: TrayPhotoStatus, emptyText: string) => (
    <>
      {strip.error ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
          <span>{strip.error}</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void load(status, 0)} className="cursor-pointer">
            Retry
          </Button>
        </div>
      ) : null}
      {strip.loading && strip.items.length === 0 ? (
        <ul className="flex gap-2 overflow-hidden" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-square w-full rounded-none" />
            </li>
          ))}
        </ul>
      ) : strip.items.length === 0 && !strip.error ? (
        <p className="py-2 text-xs text-ink-muted">{emptyText}</p>
      ) : (
        <ul className={cn("flex gap-2 overflow-x-auto pb-1 transition-opacity", strip.loading && "opacity-70")} aria-busy={strip.loading}>
          {strip.items.map((p) => (
            <UnmatchedPhotoCard key={p.id} storeSlug={storeSlug} photo={p} busy={busyIds.has(p.id)} error={errors[p.id] ?? null} onAssign={(product) => void assign(p, product)} onDismiss={() => void dismiss(p)} onRestore={() => void restore(p)} />
          ))}
          {strip.items.length < strip.total ? (
            <li className="flex w-40 shrink-0 items-center justify-center border border-dashed border-border">
              <Button type="button" variant="ghost" size="sm" disabled={strip.loading} onClick={() => void load(status, strip.items.length)} className="cursor-pointer">
                {strip.loading ? "Loading…" : `Load ${formatNumber(Math.min(TRAY_PAGE_SIZE, strip.total - strip.items.length))} more`}
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </>
  );

  return (
    <TooltipProvider>
      <section aria-labelledby={headingId} className="border border-border bg-card">
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
          <h2 id={headingId} className="font-sans text-sm font-medium tracking-normal text-ink">
            <button type="button" aria-expanded={open} onClick={() => setUserOpen(!open)} className="-ml-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <ChevronRightIcon aria-hidden className={cn("size-4 text-ink-muted transition-transform", open && "rotate-90")} />
              <ImagesIcon aria-hidden className="size-4 text-brand" />
              Unmatched photos
              <span className="num text-ink-muted">({unmatched.loading && unmatched.items.length === 0 ? "…" : formatNumber(unmatched.total)})</span>
            </button>
          </h2>
          <span className="hidden text-xs text-ink-muted md:inline">The matcher could not place these. Assign them by hand or dismiss them.</span>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor={`${headingId}-dismissed`} className="flex h-9 cursor-pointer items-center gap-2 text-xs font-normal text-ink-muted">
              <Switch
                id={`${headingId}-dismissed`}
                size="sm"
                checked={showDismissed}
                onCheckedChange={(checked) => {
                  setShowDismissed(checked);
                  if (checked) setUserOpen(true);
                }}
                className="cursor-pointer"
              />
              Show dismissed
              {showDismissed && !dismissed.loading ? <span className="num">({formatNumber(dismissed.total)})</span> : null}
            </Label>
            <Button type="button" variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh photos" className="relative cursor-pointer after:absolute after:-inset-2 after:content-['']">
              <RefreshCwIcon className={cn((unmatched.loading || dismissed.loading) && "animate-spin")} />
            </Button>
          </div>
        </div>
        {open ? (
          <div className="flex flex-col gap-3 border-t border-border px-3 py-2">
            {renderStrip(unmatched, "unmatched", "Every photo has a product. Nothing to assign.")}
            {showDismissed ? (
              <div className="flex flex-col gap-1 border-t border-dashed border-border pt-2">
                <h3 className="font-sans text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Dismissed <span className="num normal-case tracking-normal">{formatNumber(dismissed.total)}</span>
                </h3>
                {renderStrip(dismissed, "rejected", "No dismissed photos.")}
              </div>
            ) : null}
            <div role="status" aria-live="polite" className={cn("min-h-4 text-xs", notice?.tone === "error" ? "text-destructive" : "text-success")}>
              {notice?.text ?? ""}
            </div>
          </div>
        ) : null}
      </section>
    </TooltipProvider>
  );
}
