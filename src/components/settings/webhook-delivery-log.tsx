"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Copy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCountdown, formatRelative } from "@/lib/format";
import type { WebhookDeliveryDto } from "@/lib/serializers";

/** Presentational pieces of the Webhooks section: the delivery log, its status words and the one-time secret. */

export const EVENT_LABELS: Record<string, string> = { "import.completed": "Import completed", "import.needs_attention": "Import needs attention", "webhook.test": "Test" };

/** Invisible hit-area extension: the control stays 28 px tall on screen but accepts a 44 px tap (same trick as Checkbox/Switch). */
export const TAP = "relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']";

/** Status is always icon + word, never colour alone. */
export function DeliveryStatus({ status, attempt }: { status: WebhookDeliveryDto["status"]; attempt: number }) {
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 aria-hidden className="size-3.5" />
        Delivered
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <XCircle aria-hidden className="size-3.5" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <Clock aria-hidden className="size-3.5" />
      {attempt > 0 ? "Retrying" : "Pending"}
    </span>
  );
}

export function DeliveriesTable({ deliveries }: { deliveries: WebhookDeliveryDto[] }) {
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8">Time</TableHead>
          <TableHead className="h-8">Event</TableHead>
          <TableHead className="h-8">Status</TableHead>
          <TableHead className="h-8 text-right">HTTP</TableHead>
          <TableHead className="h-8 text-right">Attempts</TableHead>
          <TableHead className="h-8">Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map((d) => (
          <TableRow key={d.id} className="hover:bg-transparent">
            <TableCell className="num">
              <time dateTime={d.createdAt}>{formatRelative(d.createdAt)}</time>
            </TableCell>
            <TableCell>{EVENT_LABELS[d.event] ?? d.event}</TableCell>
            <TableCell>
              <DeliveryStatus status={d.status} attempt={d.attempt} />
              {d.status === "pending" && d.nextAttemptAt ? <span className="ml-1 text-ink-muted">next try in {formatCountdown(d.nextAttemptAt)}</span> : null}
            </TableCell>
            <TableCell className="num text-right">{d.responseCode ?? "—"}</TableCell>
            <TableCell className="num text-right">{d.attempt}</TableCell>
            <TableCell className="max-w-[28rem] truncate whitespace-normal text-ink-muted" title={d.error ?? undefined}>
              {d.error ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SecretReveal({ host, secret, onDismiss }: { host: string; secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const titleId = `secret-${host.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <div role="region" aria-labelledby={titleId} className="rule-brand space-y-2 rounded-sm bg-brand-soft/50 px-3 py-2">
      <p id={titleId} className="text-sm font-medium text-ink">
        Signing secret for {host}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="num min-w-0 flex-1 select-all break-all rounded-sm bg-card px-2 py-1.5 text-xs hairline">{secret}</code>
        <Button
          size="sm"
          variant="outline"
          className={TAP}
          onClick={() => {
            navigator.clipboard
              .writeText(secret)
              .then(() => setCopied("copied"))
              .catch(() => setCopied("failed"));
          }}
        >
          <Copy aria-hidden />
          Copy
        </Button>
        <span role="status" aria-live="polite" className="text-xs">
          {copied === "copied" ? <span className="text-success">Copied</span> : null}
          {copied === "failed" ? <span className="text-destructive">Select and copy by hand</span> : null}
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        Shown once. Verify <code className="num">X-CatalogForge-Signature</code> = sha256 HMAC of <code className="num">&lt;timestamp&gt;.&lt;body&gt;</code> with this secret.
      </p>
      <Button size="xs" variant="ghost" className={TAP} onClick={onDismiss}>
        I have saved it
      </Button>
    </div>
  );
}
