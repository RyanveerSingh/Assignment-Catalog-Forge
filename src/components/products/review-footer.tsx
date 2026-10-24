"use client";

import { useState } from "react";
import { cn } from "cn";
import { CheckIcon, RotateCcwIcon, SparklesIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import { isPromptVersion, PROMPT_VERSION } from "@/core/ai/prompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { RerunSettingsFields } from "./products-toolbar";
import type { ProductAction, ProductRow, RerunSettings } from "./types";

type Pending = "approve" | "send_back" | "reject" | "delete" | null;

export interface FooterNotice {
  tone: "ok" | "error";
  text: string;
}

const PILL = "cursor-pointer rounded-full";

/** The sticky action bar at the foot of the drawer: Approve first; every destructive or overriding choice gets an inline confirm instead of a modal. */
export function ReviewFooter({ product, busy, notice, onAction }: { product: ProductRow; busy: boolean; notice: FooterNotice | null; onAction: (a: ProductAction) => Promise<boolean> }) {
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  // Start from the version the product was last written with, as long as it is still registered.
  const [rerun, setRerun] = useState<RerunSettings>(() => ({ tier: "cheap", promptVersion: product.promptVersion !== null && isPromptVersion(product.promptVersion) ? product.promptVersion : PROMPT_VERSION }));
  const [rerunOpen, setRerunOpen] = useState(false);

  const deleted = product.deletedAt !== null;
  const needsReview = product.status === "needs_review";
  const notReady = product.status === "pending_ai";

  const run = async (a: ProductAction) => {
    const ok = await onAction(a);
    if (ok) {
      setPending(null);
      setReason("");
    }
    return ok;
  };

  const approve = async () => {
    if (needsReview && pending !== "approve") {
      setPending("approve");
      return;
    }
    await run({ action: "approve", force: needsReview });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
      {pending === "approve" ? (
        <InlineConfirm text="Approve despite review flags? It will be published as is." confirmLabel="Approve anyway" busy={busy} onConfirm={() => void run({ action: "approve", force: true })} onCancel={() => setPending(null)} />
      ) : null}
      {pending === "send_back" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="send-back-reason" className="text-xs">
            Reason
          </Label>
          <Input id="send-back-reason" value={reason} maxLength={500} placeholder="What should change?" autoFocus onChange={(e) => setReason(e.target.value)} className="h-9 max-w-sm flex-1 rounded-full px-3.5 text-xs md:text-xs" />
          <Button type="button" size="sm" disabled={busy || !reason.trim()} onClick={() => void run({ action: "send_back", reason: reason.trim() })} className={PILL}>
            Send back
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} className={PILL}>
            Cancel
          </Button>
        </div>
      ) : null}
      {pending === "reject" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="reject-reason" className="text-xs">
            Reason (optional)
          </Label>
          <Input id="reject-reason" value={reason} maxLength={500} autoFocus onChange={(e) => setReason(e.target.value)} className="h-9 max-w-sm flex-1 rounded-full px-3.5 text-xs md:text-xs" />
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void run({ action: "reject", reason: reason.trim() || undefined })} className={PILL}>
            Reject
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} className={PILL}>
            Cancel
          </Button>
        </div>
      ) : null}
      {pending === "delete" ? <InlineConfirm text="Delete this product? It leaves the storefront immediately; you can restore it later." confirmLabel="Delete" destructive busy={busy} onConfirm={() => void run({ action: "delete" })} onCancel={() => setPending(null)} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {deleted ? (
          <Button type="button" disabled={busy} onClick={() => void run({ action: "restore" })} className={PILL}>
            <Undo2Icon data-icon="inline-start" />
            Restore
          </Button>
        ) : (
          <>
            {/* Approved products stay approvable: re-approving publishes draft edits and clears "source changed" (EC-F4). */}
            <Button type="button" disabled={busy || notReady} onClick={() => void approve()} className={cn(PILL, "px-4")}>
              <CheckIcon data-icon="inline-start" />
              {product.status === "approved" ? "Re-approve & publish" : "Approve"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} aria-expanded={pending === "send_back"} onClick={() => setPending(pending === "send_back" ? null : "send_back")} className={PILL}>
              <RotateCcwIcon data-icon="inline-start" />
              Send back
            </Button>
            <Button type="button" variant="outline" disabled={busy || product.status === "rejected"} aria-expanded={pending === "reject"} onClick={() => setPending(pending === "reject" ? null : "reject")} className={PILL}>
              <XIcon data-icon="inline-start" />
              Reject
            </Button>
            <Popover open={rerunOpen} onOpenChange={setRerunOpen}>
              <PopoverTrigger render={<Button type="button" variant="outline" disabled={busy || notReady} className={PILL} />}>
                <SparklesIcon data-icon="inline-start" />
                Re-run AI
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-72 rounded-2xl p-4 shadow-[var(--shadow-pop)]">
                <PopoverHeader>
                  <PopoverTitle>Re-run the AI stage</PopoverTitle>
                  <PopoverDescription className="text-xs">Results go to the draft; the published version stays until you re-approve.</PopoverDescription>
                </PopoverHeader>
                <RerunSettingsFields idPrefix="rerun" value={rerun} onChange={setRerun} disabled={busy} />
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className={PILL}
                  onClick={async () => {
                    const ok = await run({ action: "rerun", ...rerun });
                    if (ok) setRerunOpen(false);
                  }}
                >
                  Queue re-run
                </Button>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="ghost" disabled={busy} aria-expanded={pending === "delete"} onClick={() => setPending(pending === "delete" ? null : "delete")} className={cn(PILL, "ml-auto text-ink-muted hover:text-destructive")}>
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </>
        )}
      </div>
      <div role="status" aria-live="polite" className={cn("min-h-4 text-xs", notice?.tone === "error" ? "text-destructive" : notice?.tone === "ok" ? "text-success" : "text-ink-muted")}>
        {notice?.text ?? ""}
      </div>
    </div>
  );
}

function InlineConfirm({ text, confirmLabel, destructive, busy, onConfirm, onCancel }: { text: string; confirmLabel: string; destructive?: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="group" aria-label={text} className={cn("flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs", destructive ? "bg-destructive/5 text-ink ring-1 ring-destructive/20" : "bg-warning-soft text-ink")}>
      <span className="flex-1">{text}</span>
      <Button type="button" variant={destructive ? "destructive" : "default"} size="xs" disabled={busy} autoFocus onClick={onConfirm} className={PILL}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel} className={PILL}>
        Cancel
      </Button>
    </div>
  );
}
