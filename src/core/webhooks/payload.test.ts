import { describe, expect, it } from "vitest";
import { buildImportEventPayload, buildTestEventPayload, importEventId, isImportWebhookEvent, type WebhookImportInput } from "./payload";

const NOW = new Date("2026-10-23T10:00:00.000Z");
const STORE = { id: "11111111-1111-4111-8111-111111111111", slug: "demo" };

function importRow(over: Partial<WebhookImportInput> = {}): WebhookImportInput {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "messy-120.csv",
    status: "completed",
    totalRows: 120,
    counts: { pending: 0, processing: 0, done: 100, needs_review: 15, failed: 5 },
    productCount: 98,
    costMicros: 123_456,
    startedAt: new Date("2026-10-23T09:58:00.000Z"),
    finishedAt: NOW,
    ...over,
  };
}

describe("buildImportEventPayload (EC-I8)", () => {
  it("EC-I8: produces the documented shape with ISO dates and integer micros", () => {
    const payload = buildImportEventPayload({ event: "import.completed", now: NOW, store: STORE, import: importRow() });
    expect(payload).toEqual({
      event: "import.completed",
      id: "import.completed:22222222-2222-4222-8222-222222222222",
      createdAt: "2026-10-23T10:00:00.000Z",
      store: { id: STORE.id, slug: "demo" },
      import: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "messy-120.csv",
        status: "completed",
        totalRows: 120,
        counts: { pending: 0, processing: 0, done: 100, needs_review: 15, failed: 5 },
        productCount: 98,
        costMicros: 123_456,
        startedAt: "2026-10-23T09:58:00.000Z",
        finishedAt: "2026-10-23T10:00:00.000Z",
      },
    });
  });

  it("EC-I8: copies only the listed fields, so extra columns on the import row never leak", () => {
    const row = { ...importRow(), parseMeta: { headers: ["secret column"] }, columnMap: [1], error: "internal detail" } as WebhookImportInput;
    const payload = buildImportEventPayload({ event: "import.needs_attention", now: NOW, store: STORE, import: row });
    expect(Object.keys(payload.import).sort()).toEqual(["costMicros", "counts", "finishedAt", "id", "name", "productCount", "startedAt", "status", "totalRows"]);
    expect(JSON.stringify(payload)).not.toContain("internal detail");
    expect(JSON.stringify(payload)).not.toContain("secret column");
  });

  it("EC-I8: missing timestamps are null, never the string 'null' or an invalid date", () => {
    const payload = buildImportEventPayload({ event: "import.needs_attention", now: NOW, store: STORE, import: importRow({ startedAt: null, finishedAt: null }) });
    expect(payload.import.startedAt).toBeNull();
    expect(payload.import.finishedAt).toBeNull();
  });

  it("EC-I10: the event id depends only on the event and the import, so a re-run of finalize builds the same id", () => {
    const a = buildImportEventPayload({ event: "import.completed", now: NOW, store: STORE, import: importRow() });
    const b = buildImportEventPayload({ event: "import.completed", now: new Date(NOW.getTime() + 60_000), store: STORE, import: importRow({ costMicros: 999 }) });
    expect(a.id).toBe(b.id);
    expect(importEventId("import.needs_attention", "x")).toBe("import.needs_attention:x");
    expect(importEventId("import.completed", "x")).not.toBe(importEventId("import.needs_attention", "x"));
  });

  it("EC-I8: a test delivery uses the same envelope (event, id, createdAt, store)", () => {
    const payload = buildTestEventPayload({ id: "webhook.test:abc", now: NOW, store: STORE });
    expect(payload.event).toBe("webhook.test");
    expect(payload.id).toBe("webhook.test:abc");
    expect(payload.createdAt).toBe("2026-10-23T10:00:00.000Z");
    expect(payload.store).toEqual(STORE);
    expect(payload.message).toMatch(/signature/i);
  });

  it.each([
    ["import.completed", true],
    ["import.needs_attention", true],
    ["webhook.test", false],
    ["product.approved", false],
    ["", false],
  ])("isImportWebhookEvent(%j) → %s", (value, expected) => {
    expect(isImportWebhookEvent(value)).toBe(expected);
  });
});
