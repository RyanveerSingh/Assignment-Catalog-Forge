"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Loader2, Send, Trash2, WebhookIcon } from "lucide-react";
import { cn } from "cn";
import { TAP_TARGET } from "@/components/ext/surfaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatRelative } from "@/lib/format";
import type { WebhookDeliveryDto, WebhookDto } from "@/lib/serializers";
import { SaveStatus, SectionCard, useSave } from "./section-card";
import { DeliveriesTable, DeliveryStatus, EVENT_LABELS, SecretReveal } from "./webhook-delivery-log";

const EVENT_OPTIONS: ReadonlyArray<{ value: "import.completed" | "import.needs_attention"; label: string; hint: string }> = [
  { value: "import.completed", label: "Import completed", hint: "Every row reached Done, Needs review or Failed and the counts add up." },
  { value: "import.needs_attention", label: "Import needs attention", hint: "The import finished but the counts do not add up; someone should look." },
];

const POLL_MS = 2_000;
const MAX_POLLS = 20;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function WebhooksSection({ storeSlug, disabled }: { storeSlug: string; disabled: boolean }) {
  const [hooks, setHooks] = useState<WebhookDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ webhookId: string; secret: string } | null>(null);
  const base = `${storeApi(storeSlug)}/webhooks`;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await api<{ webhooks: WebhookDto[] }>(base, { cache: "no-store" });
      setHooks(r.webhooks);
    } catch (err) {
      setLoadError(errorText(err, "Could not load webhooks"));
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceHook = useCallback((next: WebhookDto) => setHooks((cur) => (cur ? cur.map((x) => (x.id === next.id ? next : x)) : cur)), []);
  // The summary line follows the delivery log, so a test's result shows without a reload.
  const onLastDelivery = useCallback(
    (webhookId: string, last: WebhookDto["lastDelivery"]) => setHooks((cur) => (cur ? cur.map((x) => (x.id === webhookId ? { ...x, lastDelivery: last } : x)) : cur)),
    [],
  );

  return (
    <SectionCard id="webhooks" icon={WebhookIcon} title="Webhooks" description="Called when an import finishes. Every delivery is signed with a per-webhook secret and retried with backoff when your endpoint is down.">
      {loadError ? (
        <div role="alert" className="flex items-center gap-2 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle aria-hidden className="size-4 shrink-0" />
          <span>{loadError}</span>
          <Button variant="outline" size="xs" className="ml-auto" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}
      {hooks === null && !loadError ? <Skeleton aria-label="Loading webhooks" className="h-16 rounded-sm" /> : null}
      {hooks && hooks.length === 0 ? <p className="text-sm text-ink-muted">No webhooks yet. Add one below to be told when an import finishes.</p> : null}
      {hooks && hooks.length > 0 ? (
        <ul className="divide-y divide-border rounded-sm hairline" aria-label="Webhooks">
          {hooks.map((h) => (
            <WebhookItem
              key={h.id}
              hook={h}
              base={base}
              disabled={disabled}
              secret={revealed?.webhookId === h.id ? revealed.secret : null}
              onDismissSecret={() => setRevealed(null)}
              onChange={replaceHook}
              onLastDelivery={onLastDelivery}
              onDeleted={() => setHooks((cur) => (cur ? cur.filter((x) => x.id !== h.id) : cur))}
            />
          ))}
        </ul>
      ) : null}
      <AddWebhookForm
        base={base}
        disabled={disabled || hooks === null}
        onCreated={(hook, secret) => {
          setHooks((cur) => [...(cur ?? []), hook]);
          setRevealed({ webhookId: hook.id, secret });
        }}
      />
    </SectionCard>
  );
}

function WebhookItem({
  hook,
  base,
  disabled,
  secret,
  onDismissSecret,
  onChange,
  onLastDelivery,
  onDeleted,
}: {
  hook: WebhookDto;
  base: string;
  disabled: boolean;
  secret: string | null;
  onDismissSecret: () => void;
  onChange: (next: WebhookDto) => void;
  onLastDelivery: (webhookId: string, last: WebhookDto["lastDelivery"]) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[] | null>(null);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const polls = useRef(0);
  const testSave = useSave();
  const toggleSave = useSave();
  const deleteSave = useSave();
  const item = `${base}/${hook.id}`;
  const panelId = `webhook-${hook.id}-deliveries`;

  const loadDeliveries = useCallback(async () => {
    try {
      const r = await api<{ deliveries: WebhookDeliveryDto[] }>(`${item}/deliveries?limit=20`, { cache: "no-store" });
      setDeliveries(r.deliveries);
      setDeliveriesError(null);
      const newest = r.deliveries[0];
      if (newest) onLastDelivery(hook.id, { id: newest.id, event: newest.event, status: newest.status, responseCode: newest.responseCode, attempt: newest.attempt, createdAt: newest.createdAt });
    } catch (err) {
      setDeliveriesError(errorText(err, "Could not load deliveries"));
    }
  }, [item, hook.id, onLastDelivery]);

  useEffect(() => {
    if (open && deliveries === null) void loadDeliveries();
  }, [open, deliveries, loadDeliveries]);

  // While a delivery is pending the log refreshes itself for a while, so a test shows its result without a reload.
  const pending = open && (deliveries?.some((d) => d.status === "pending") ?? false);
  useEffect(() => {
    if (!pending || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      void loadDeliveries();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, deliveries, loadDeliveries]);

  const last = hook.lastDelivery;

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="num break-all text-sm text-ink">{hook.url}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>{hook.events.map((e) => EVENT_LABELS[e] ?? e).join(", ")}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 text-ink">
              <span aria-hidden className={cn("size-1.5 rounded-full", hook.active ? "bg-success" : "bg-ink-muted")} />
              {hook.active ? "Enabled" : "Disabled"}
            </span>
            <span aria-hidden>·</span>
            {last ? (
              <span className="inline-flex items-center gap-1.5">
                <DeliveryStatus status={last.status} attempt={last.attempt} />
                {last.responseCode !== null ? <span className="num">HTTP {last.responseCode}</span> : null}
                <span>{formatRelative(last.createdAt)}</span>
              </span>
            ) : (
              <span>No deliveries yet</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className={TAP_TARGET}
            disabled={disabled || !hook.active || testSave.state.kind === "saving"}
            onClick={() =>
              void testSave.run(async () => {
                await api(`${item}/test`, { method: "POST" });
                polls.current = 0;
                setOpen(true);
                await loadDeliveries();
              })
            }
          >
            {testSave.state.kind === "saving" ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            Send test
          </Button>
          <Button size="sm" variant="ghost" className={TAP_TARGET} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            Deliveries
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={TAP_TARGET}
            disabled={disabled || toggleSave.state.kind === "saving"}
            onClick={() => void toggleSave.run(async () => onChange((await api<{ webhook: WebhookDto }>(item, { method: "PATCH", json: { active: !hook.active } })).webhook))}
          >
            {hook.active ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" className={cn(TAP_TARGET, "text-ink-muted hover:text-destructive")} disabled={disabled || confirming} aria-label={`Delete webhook for ${hostOf(hook.url)}`} onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      </div>
      <SaveStatus state={testSave.state.kind === "saved" ? { kind: "idle" } : testSave.state} />
      {secret ? <SecretReveal host={hostOf(hook.url)} secret={secret} onDismiss={onDismissSecret} /> : null}
      {confirming ? (
        <div role="alertdialog" aria-labelledby={`${panelId}-confirm`} className="flex flex-wrap items-center gap-3 rounded-sm bg-destructive/10 px-3 py-2 text-sm">
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
          <span id={`${panelId}-confirm`} className="text-destructive">
            Delete the webhook for {hostOf(hook.url)}? Its delivery log goes with it.
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="destructive" autoFocus className={TAP_TARGET} disabled={deleteSave.state.kind === "saving"} onClick={() => void deleteSave.run(async () => (await api(item, { method: "DELETE" }), onDeleted()))}>
              Yes, delete
            </Button>
            <Button size="sm" variant="outline" className={TAP_TARGET} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
          <SaveStatus state={deleteSave.state} />
        </div>
      ) : null}
      {open ? (
        <div id={panelId} className="rounded-sm bg-muted/40 px-2 py-1">
          {deliveriesError ? <p className="px-1 py-2 text-xs text-destructive">{deliveriesError}</p> : null}
          {deliveries === null && !deliveriesError ? <p className="px-1 py-2 text-xs text-ink-muted">Loading deliveries…</p> : null}
          {deliveries && deliveries.length === 0 ? <p className="px-1 py-2 text-xs text-ink-muted">Nothing delivered yet. Send a test or finish an import.</p> : null}
          {deliveries && deliveries.length > 0 ? <DeliveriesTable deliveries={deliveries} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function AddWebhookForm({ base, disabled, onCreated }: { base: string; disabled: boolean; onCreated: (hook: WebhookDto, secret: string) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["import.completed"]);
  const { state, run, reset } = useSave();
  const valid = url.trim().length > 0 && events.length > 0;

  return (
    <form
      className="space-y-3 border-t border-border pt-4"
      aria-labelledby="webhook-add-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || disabled) return;
        void run(async () => {
          const r = await api<{ webhook: WebhookDto; secret: string }>(base, { method: "POST", json: { url: url.trim(), events } });
          onCreated(r.webhook, r.secret);
          setUrl("");
        });
      }}
    >
      <p id="webhook-add-title" className="text-sm font-medium">
        Add a webhook
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://example.com/hooks/catalogforge"
          value={url}
          disabled={disabled}
          aria-describedby="webhook-url-hint"
          aria-invalid={state.kind === "error"}
          className="num"
          onChange={(e) => {
            setUrl(e.target.value);
            reset();
          }}
        />
        <p id="webhook-url-hint" className="text-xs text-ink-muted">
          https only, on a public host. Private and internal addresses are refused, also at send time.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Events</legend>
        {EVENT_OPTIONS.map((opt) => {
          const id = `webhook-event-${opt.value}`;
          return (
            <div key={opt.value} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={id}
                checked={events.includes(opt.value)}
                disabled={disabled}
                onChange={(e) => {
                  setEvents((cur) => (e.target.checked ? [...new Set([...cur, opt.value])] : cur.filter((v) => v !== opt.value)));
                  reset();
                }}
                className={cn("mt-1 size-3.5 cursor-pointer accent-brand disabled:cursor-not-allowed", TAP_TARGET)}
              />
              <Label htmlFor={id} className="min-h-6 cursor-pointer flex-col items-start gap-0.5">
                <span>{opt.label}</span>
                <span className="text-xs font-normal leading-snug text-ink-muted">{opt.hint}</span>
              </Label>
            </div>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" className={TAP_TARGET} disabled={disabled || !valid || state.kind === "saving"}>
          {state.kind === "saving" ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Add webhook
        </Button>
        <SaveStatus state={state} savedLabel="Webhook added; copy the secret above" />
      </div>
    </form>
  );
}
