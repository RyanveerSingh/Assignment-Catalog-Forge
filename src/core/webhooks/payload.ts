/**
 * Webhook event payloads (EC-I8). The body is a contract with the merchant's receiver: keys are
 * stable, dates are ISO strings, money stays in micros, and nothing the model wrote is included,
 * so the body is small and can never leak a draft listing or a secret.
 */

export const IMPORT_WEBHOOK_EVENTS = ["import.completed", "import.needs_attention"] as const;
export type ImportWebhookEvent = (typeof IMPORT_WEBHOOK_EVENTS)[number];

export function isImportWebhookEvent(value: string): value is ImportWebhookEvent {
  return (IMPORT_WEBHOOK_EVENTS as ReadonlyArray<string>).includes(value);
}

export interface WebhookStoreInput {
  id: string;
  slug: string;
}

export interface WebhookImportInput {
  id: string;
  name: string;
  status: string;
  totalRows: number;
  counts: { pending: number; processing: number; done: number; needs_review: number; failed: number };
  productCount: number;
  costMicros: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ImportEventPayload {
  event: ImportWebhookEvent;
  /** Deterministic per (event, import), so a re-run of finalize cannot create a second delivery (EC-I10). */
  id: string;
  createdAt: string;
  store: { id: string; slug: string };
  import: {
    id: string;
    name: string;
    status: string;
    totalRows: number;
    counts: WebhookImportInput["counts"];
    productCount: number;
    costMicros: number;
    startedAt: string | null;
    finishedAt: string | null;
  };
}

export interface TestEventPayload {
  event: "webhook.test";
  id: string;
  createdAt: string;
  store: { id: string; slug: string };
  message: string;
}

export type WebhookPayload = ImportEventPayload | TestEventPayload;

/** The event id an import event always gets; exported so the repository and tests agree on it. */
export function importEventId(event: ImportWebhookEvent, importId: string): string {
  return `${event}:${importId}`;
}

export function buildImportEventPayload(input: { event: ImportWebhookEvent; now: Date; store: WebhookStoreInput; import: WebhookImportInput }): ImportEventPayload {
  const imp = input.import;
  return {
    event: input.event,
    id: importEventId(input.event, imp.id),
    createdAt: input.now.toISOString(),
    store: { id: input.store.id, slug: input.store.slug },
    import: {
      id: imp.id,
      name: imp.name,
      status: imp.status,
      totalRows: imp.totalRows,
      counts: {
        pending: imp.counts.pending,
        processing: imp.counts.processing,
        done: imp.counts.done,
        needs_review: imp.counts.needs_review,
        failed: imp.counts.failed,
      },
      productCount: imp.productCount,
      costMicros: imp.costMicros,
      startedAt: imp.startedAt ? imp.startedAt.toISOString() : null,
      finishedAt: imp.finishedAt ? imp.finishedAt.toISOString() : null,
    },
  };
}

/** The "Send test" body: same envelope as a real event so a receiver can be built against it. */
export function buildTestEventPayload(input: { id: string; now: Date; store: WebhookStoreInput }): TestEventPayload {
  return {
    event: "webhook.test",
    id: input.id,
    createdAt: input.now.toISOString(),
    store: { id: input.store.id, slug: input.store.slug },
    message: "Test delivery from CatalogForge. Verify the signature and answer 2xx.",
  };
}
