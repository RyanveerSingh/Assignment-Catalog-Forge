"use client";

import { useState } from "react";
import { cn } from "cn";
import { CheckIcon, RotateCcwIcon, SparklesIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductAction, ProductRow } from "./types";

type Tier = "cheap" | "strong" | "vision" | "escalation";
const TIERS: Array<{ value: Tier; label: string }> = [
  { value: "cheap", label: "Cheap (fast model)" },
  { value: "strong", label: "Strong" },
  { value: "vision", label: "Vision (uses photos)" },
  { value: "escalation", label: "Escalation" },
];

type Pending = "approve" | "send_back" | "reject" | "delete" | null;

export interface FooterNotice {
  tone: "ok" | "error" | "info";
  text: string;
}

/** Footer actions: every destructive or overriding choice gets an inline confirm instead of a modal. */
export function ReviewFooter({ product, busy, notice, onAction }: { product: ProductRow; busy: boolean; notice: FooterNotice | null; onAction: (a: ProductAction) => Promise<boolean> }) {
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState<Tier>("cheap");
  const [promptVersion, setPromptVersion] = useState(product.promptVersion ?? "v1");
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
    <div className="flex flex-col gap-2 border-t border-border bg-popover px-4 py-3">
      {pending === "approve" ? (
        <InlineConfirm text="Approve despite review flags? It will be published as is." confirmLabel="Approve anyway" busy={busy} onConfirm={() => void run({ action: "approve", force: true })} onCancel={() => setPending(null)} />
      ) : null}
      {pending === "send_back" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="send-back-reason" className="text-xs">
            Reason
          </Label>
          <Input id="send-back-reason" value={reason} maxLength={500} placeholder="What should change?" autoFocus onChange={(e) => setReason(e.target.value)} className="h-7 max-w-sm flex-1 text-xs md:text-xs" />
          <Button type="button" size="sm" disabled={busy || !reason.trim()} onClick={() => void run({ action: "send_back", reason: reason.trim() })} className="cursor-pointer">
            Send back
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      ) : null}
      {pending === "reject" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="reject-reason" className="text-xs">
            Reason (optional)
          </Label>
          <Input id="reject-reason" value={reason} maxLength={500} autoFocus onChange={(e) => setReason(e.target.value)} className="h-7 max-w-sm flex-1 text-xs md:text-xs" />
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void run({ action: "reject", reason: reason.trim() || undefined })} className="cursor-pointer">
            Reject
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      ) : null}
      {pending === "delete" ? <InlineConfirm text="Delete this product? It leaves the storefront immediately; you can restore it later." confirmLabel="Delete" destructive busy={busy} onConfirm={() => void run({ action: "delete" })} onCancel={() => setPending(null)} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {deleted ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run({ action: "restore" })} className="cursor-pointer">
            <Undo2Icon data-icon="inline-start" />
            Restore
          </Button>
        ) : (
          <>
            {/* Approved products stay approvable: re-approving publishes draft edits and clears "source changed" (EC-F4). */}
            <Button type="button" size="sm" disabled={busy || notReady} onClick={() => void approve()} className="cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90">
              <CheckIcon data-icon="inline-start" />
              {product.status === "approved" ? "Re-approve & publish" : "Approve"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} aria-expanded={pending === "send_back"} onClick={() => setPending(pending === "send_back" ? null : "send_back")} className="cursor-pointer">
              <RotateCcwIcon data-icon="inline-start" />
              Send back
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || product.status === "rejected"} aria-expanded={pending === "reject"} onClick={() => setPending(pending === "reject" ? null : "reject")} className="cursor-pointer">
              <XIcon data-icon="inline-start" />
              Reject
            </Button>
            <Popover open={rerunOpen} onOpenChange={setRerunOpen}>
              <PopoverTrigger render={<Button type="button" variant="outline" size="sm" disabled={busy || notReady} className="cursor-pointer" />}>
                <SparklesIcon data-icon="inline-start" />
                Re-run AI
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-72">
                <PopoverHeader>
                  <PopoverTitle>Re-run the AI stage</PopoverTitle>
                  <PopoverDescription className="text-xs">Results go to the draft; the published version stays until you re-approve.</PopoverDescription>
                </PopoverHeader>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Model tier</Label>
                  <Select value={tier} onValueChange={(v) => v && setTier(v as Tier)}>
                    <SelectTrigger size="sm" className="w-full cursor-pointer" aria-label="Model tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rerun-prompt-version" className="text-xs">
                    Prompt version
                  </Label>
                  <Input id="rerun-prompt-version" value={promptVersion} maxLength={20} onChange={(e) => setPromptVersion(e.target.value)} className="h-7 text-xs md:text-xs" />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className="cursor-pointer"
                  onClick={async () => {
                    const ok = await run({ action: "rerun", tier, promptVersion: promptVersion.trim() || undefined });
                    if (ok) setRerunOpen(false);
                  }}
                >
                  Queue re-run
                </Button>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="ghost" size="sm" disabled={busy} aria-expanded={pending === "delete"} onClick={() => setPending(pending === "delete" ? null : "delete")} className="ml-auto cursor-pointer text-ink-muted hover:text-destructive">
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
    <div role="group" aria-label={text} className={cn("flex flex-wrap items-center gap-2 border px-2 py-1.5 text-xs", destructive ? "border-destructive/30 bg-destructive/5 text-ink" : "border-warning/40 bg-warning-soft text-ink")}>
      <span className="flex-1">{text}</span>
      <Button type="button" variant={destructive ? "destructive" : "default"} size="xs" disabled={busy} autoFocus onClick={onConfirm} className="cursor-pointer">
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel} className="cursor-pointer">
        Cancel
      </Button>
    </div>
  );
}
