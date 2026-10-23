"use client";

/* eslint-disable @next/next/no-img-element -- the header photo comes from our own blob route */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { CircleAlertIcon, ImageIcon, RefreshCwIcon, ScanSearchIcon } from "lucide-react";
import { Chip } from "@/components/ext/chip";
import { StatusBadge } from "@/components/ext/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatDuration, formatMicrosUsdApprox, modelLabel, tierLabel } from "@/lib/format";
import { PhotoGrid } from "./photo-grid";
import { ReviewFooter, type FooterNotice } from "./review-footer";
import { ReviewListing } from "./review-listing";
import { ReviewTranslations } from "./review-translations";
import { IssueList, SourceRows } from "./source-rows";
import { imageUrl, sameHighlight, type ProductAction, type ProductDetail, type SourceHighlight } from "./types";
import { VariantTable } from "./variant-table";

const ACTION_DONE: Record<ProductAction["action"], string> = {
  approve: "Approved and published.",
  reject: "Rejected and removed from the storefront.",
  send_back: "Sent back for review.",
  rerun: "Queued a fresh AI run; the draft updates when it finishes.",
  delete: "Deleted. Restore any time from this drawer.",
  restore: "Restored.",
  translate: "Translation saved as a manual fix.",
};

const TAB = "h-9 flex-none cursor-pointer rounded-full px-4 text-[13px] data-active:bg-card data-active:text-ink data-active:shadow-[var(--shadow-card)]";

/** "Written by Haiku 5.5 in 36 s for $0.002 from messy-120.csv": the merchant's sentence; the ids sit in the line below it. */
function WrittenBy({ product, importName }: { product: ProductDetail["product"]; importName: string | null }) {
  const from = importName ? ` from ${importName}` : "";
  if (!product.aiModel) return <span className="text-xs text-ink">Not written yet{from}</span>;
  const took = product.aiLatencyMs !== null ? ` in ${formatDuration(product.aiLatencyMs)}` : "";
  return (
    <span className="text-xs text-ink">
      Written by <span title={product.aiModel}>{modelLabel(product.aiModel)}</span>
      {took} for {formatMicrosUsdApprox(product.aiCostMicros)}
      {from}
    </span>
  );
}

function Section({ title, count, extra, children }: { title: string; count?: number; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          {title}
          {count !== undefined ? <span className="num rounded-full bg-surface-2 px-1.5 text-[11px] normal-case tracking-normal">{count}</span> : null}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

/**
 * Wide right-hand sheet for reviewing one product: raw source on the left, the AI listing on the right,
 * so every claim can be checked against the cell it came from before approving. A hovered chip lights
 * its cell up for as long as the pointer stays; a pressed chip keeps it lit until pressed again.
 */
export function ReviewDrawer({ storeSlug, productId, onClose, onChanged }: { storeSlug: string; productId: string | null; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [hover, setHover] = useState<SourceHighlight | null>(null);
  const [pinned, setPinned] = useState<SourceHighlight | null>(null);
  const [showCleaning, setShowCleaning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FooterNotice | null>(null);
  const [tab, setTab] = useState<"listing" | "translations">("listing");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async (id: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api<ProductDetail>(`${storeApi(storeSlug)}/products/${id}`);
      if (seq !== requestSeq.current) return;
      setDetail(data);
      setLoadedAt(Date.now());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Could not load the product");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    setDetail(null);
    setNotice(null);
    setHover(null);
    setPinned(null);
    setTab("listing");
    if (productId) void load(productId);
  }, [productId, load]);

  const runAction = useCallback(
    async (a: ProductAction): Promise<boolean> => {
      if (!productId) return false;
      setBusy(true);
      setNotice(null);
      try {
        await api(`${storeApi(storeSlug)}/products/${productId}`, { method: "POST", json: a });
        setNotice({ tone: "ok", text: ACTION_DONE[a.action] });
        await load(productId);
        onChanged();
        return true;
      } catch (err) {
        setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "Action failed" });
        // The state may have moved under us (another tab, the worker): resync so the buttons reflect reality.
        await load(productId);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [productId, storeSlug, load, onChanged],
  );

  const onSaved = useCallback(() => {
    if (!productId) return;
    setNotice({ tone: "ok", text: "Saved. Edited fields are now manual overrides and will be re-translated." });
    void load(productId).then(onChanged);
  }, [productId, load, onChanged]);

  // Pressing the chip that is already pinned unpins it.
  const onSelect = useCallback((h: SourceHighlight) => setPinned((p) => (sameHighlight(p, h) ? null : h)), []);

  const product = detail?.product ?? null;
  const group = product?.group ?? null;
  const cover = detail?.photos[0] ?? null;
  const translationCount = detail?.translations.length ?? 0;
  const outdatedCount = detail?.translations.filter((t) => t.status === "outdated" || t.status === "failed").length ?? 0;

  return (
    <Sheet open={productId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {/* The sheet's own transition is 200 ms from 2.5 rem; a wide review surface earns a longer, softer glide and rounded left corners. */}
      <SheetContent
        side="right"
        initialFocus={titleRef}
        className="w-full gap-0 border-0 bg-card p-0 shadow-[var(--shadow-pop)] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=right]:w-full data-[side=right]:data-ending-style:translate-x-10 data-[side=right]:data-starting-style:translate-x-16 data-[side=right]:sm:max-w-[1100px] data-[side=right]:sm:rounded-l-3xl"
        aria-busy={loading || busy}
      >
        <header className="flex gap-4 border-b border-border px-5 py-4 pr-14">
          {cover ? (
            <span className="block size-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border">
              <img src={imageUrl(storeSlug, cover.thumbBlobId)} alt="" width={56} height={56} className="size-full object-cover" />
            </span>
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-line-strong text-ink-muted" aria-hidden>
              <ImageIcon className="size-5" />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle ref={titleRef} tabIndex={-1} className="font-display text-[1.35rem] leading-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {product ? (product.draft?.title ?? product.group?.title ?? product.productKey) : loading ? "Loading…" : "Product"}
              </SheetTitle>
              {product ? <StatusBadge status={product.status} /> : null}
              {product?.published ? (
                <Chip tone="success" dot>
                  live
                </Chip>
              ) : null}
              {product?.deletedAt ? <Chip tone="neutral">deleted</Chip> : null}
              {product?.sourceChangedAt ? <Chip tone="warning">source changed</Chip> : null}
              {product?.missingFromImportId ? <Chip tone="danger">missing from latest upload</Chip> : null}
            </div>
            <SheetDescription className="flex flex-col gap-0.5 text-[11px] text-ink-muted">
              {product ? (
                <>
                  <WrittenBy product={product} importName={detail?.importName ?? null} />
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="num">{product.productKey}</span>
                    {product.promptVersion ? <span className="num">· prompt {product.promptVersion}</span> : null}
                    {product.aiTier ? <span>· {tierLabel(product.aiTier).toLowerCase()}</span> : null}
                  </span>
                </>
              ) : (
                "Source rows on the left, the AI listing on the right."
              )}
            </SheetDescription>
            {product && product.reviewReasons.length > 0 ? (
              <ul className="flex flex-col gap-0.5 rounded-xl bg-warning-soft px-3 py-2 text-xs text-ink" aria-label="Review reasons">
                {product.reviewReasons.map((r) => (
                  <li key={r} className="flex items-start gap-1.5">
                    <CircleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0 text-warning" />
                    {r}
                  </li>
                ))}
              </ul>
            ) : null}
            {product?.status === "failed" && product.failureReason ? <p className="rounded-xl bg-destructive/5 px-3 py-2 text-xs text-destructive">Writing failed: {product.failureReason}</p> : null}
          </div>
        </header>

        {error ? (
          <div className="flex flex-col items-start gap-2 p-5 text-sm">
            <p className="text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => productId && void load(productId)} className="cursor-pointer rounded-full">
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : !detail ? (
          <div className="grid flex-1 grid-cols-1 gap-5 p-5 md:grid-cols-2" aria-hidden>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-56 rounded-full" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
            </div>
          </div>
        ) : (
          <div className={cn("grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden", busy && "opacity-70")}>
            <div className="flex flex-col gap-5 border-b border-border bg-paper/60 p-5 md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-base text-ink">Source</h2>
                {group ? (
                  <span className="num text-[11px] text-ink-muted" title="How the rows were grouped into this product, the language detected in them, and the complexity score that picked the model">
                    grouped by {group.keySource.replace(/_/g, " ")} · {group.language.lang} · complexity {group.complexity}
                  </span>
                ) : null}
              </div>
              <Section
                title="Rows"
                count={detail.sourceRows.length}
                extra={
                  <Button type="button" variant="ghost" size="xs" aria-pressed={showCleaning} onClick={() => setShowCleaning((s) => !s)} className="cursor-pointer rounded-full text-ink-muted aria-pressed:bg-brand-soft aria-pressed:text-brand" title="What the deterministic cleaner changed in each row before the AI saw it">
                    <ScanSearchIcon data-icon="inline-start" />
                    {showCleaning ? "Hide cleaning" : "Show cleaning"}
                  </Button>
                }
              >
                <SourceRows rows={detail.sourceRows} highlight={hover ?? pinned} showCleaning={showCleaning} />
              </Section>
              <Section title="Photos" count={detail.photos.length}>
                <PhotoGrid storeSlug={storeSlug} photos={detail.photos} />
              </Section>
              <Section title="Variants" count={detail.variants.length}>
                <VariantTable variants={detail.variants} />
              </Section>
              <Section title="Conflicts" count={group?.conflicts.length ?? 0}>
                <IssueList issues={group?.conflicts ?? []} emptyText="No conflicts between source rows." />
              </Section>
              <Section title="Issues" count={group?.issues.length ?? 0}>
                <IssueList issues={group?.issues ?? []} emptyText="No issues from cleaning or grouping." />
              </Section>
            </div>
            <div className="flex flex-col p-5 md:min-h-0 md:overflow-y-auto">
              <Tabs value={tab} onValueChange={(v) => setTab(v === "translations" ? "translations" : "listing")} className="gap-5">
                <TabsList className="h-11 w-fit rounded-full bg-surface-2 p-1">
                  <TabsTrigger value="listing" className={TAB}>
                    Listing
                  </TabsTrigger>
                  <TabsTrigger value="translations" className={TAB}>
                    Translations
                    <span className="num text-[11px] text-ink-muted">{translationCount}</span>
                    {outdatedCount > 0 ? <span className="size-1.5 rounded-full bg-warning" aria-label={`${outdatedCount} need attention`} /> : null}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="listing">
                  <ReviewListing key={`${detail.product.id}:${detail.product.version}`} storeSlug={storeSlug} detail={detail} pinned={pinned} onHover={setHover} onSelect={onSelect} onSaved={onSaved} onReload={() => productId && void load(productId)} />
                </TabsContent>
                <TabsContent value="translations">
                  <ReviewTranslations key={`${detail.product.id}:${loadedAt}`} translations={detail.translations} onAction={runAction} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}

        {product ? <ReviewFooter key={product.id} product={product} busy={busy} notice={notice} onAction={runAction} /> : null}
      </SheetContent>
    </Sheet>
  );
}
