import { describe, expect, it } from "vitest";
import { formatMb, readImportRequest, type UploadLimits } from "./import-request";

// Explicit limits keep these tests independent of the environment (getConfig needs DATABASE_URL).
const LIMITS: UploadLimits = { maxUploadBytes: 1024 * 1024, maxSheetBytes: 2048, maxPhotoBytes: 1024, maxZipBytes: 4096, maxPhotos: 3 };

type Field = string | File | File[];

/** A multipart request as a browser sends it: serialized body with Content-Length declared. */
async function formRequest(fields: Record<string, Field>, opts: { contentLength?: string | null } = {}): Promise<Request> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
  }
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type") ?? "";
  const body = Buffer.from(await encoded.arrayBuffer());
  const headers: Record<string, string> = { "content-type": contentType };
  const length = opts.contentLength === undefined ? String(body.length) : opts.contentLength;
  if (length !== null) headers["content-length"] = length;
  return new Request("http://localhost/api/imports", { method: "POST", headers, body });
}

function jsonRequest(body: string, contentLength?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return new Request("http://localhost/api/imports", { method: "POST", headers, body });
}

function bytes(n: number, name: string): File {
  return new File([new Uint8Array(n)], name);
}

const SHEET = new File(["sku,title\nA-1,Mug\n"], "list.csv", { type: "text/csv" });

describe("readImportRequest", () => {
  it("reads the sheet, mode and budget from multipart form data", async () => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET, mode: "economy", budgetCents: "250" }), LIMITS);
    expect(req.sheet.name).toBe("list.csv");
    expect(req.sheet.data.toString("utf8")).toContain("A-1,Mug");
    expect(req.mode).toBe("economy");
    expect(req.budgetCents).toBe(250);
    expect(req.photos).toEqual([]);
  });

  it.each(["on", "true", "1"])("EC-F11: autoPublish=%s on the form turns auto-publish on", async (value) => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET, autoPublish: value }), LIMITS);
    expect(req.autoPublish).toBe(true);
  });

  it.each(["false", "off", "0", "yes please"])("EC-F11: autoPublish=%s on the form leaves auto-publish off", async (value) => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET, autoPublish: value }), LIMITS);
    expect(req.autoPublish).toBe(false);
  });

  it("EC-F11: a form without the field defaults to manual publishing", async () => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET }), LIMITS);
    expect(req.autoPublish).toBe(false);
    expect(req.mode).toBe("fast");
    expect(req.budgetCents).toBeUndefined();
  });

  it("rejects a form with neither a sheet nor a link", async () => {
    await expect(readImportRequest(await formRequest({ mode: "fast" }), LIMITS)).rejects.toMatchObject({ status: 400, code: "missing_sheet" });
  });

  it("rejects a form that sends both a sheet and a link", async () => {
    const req = await formRequest({ sheet: SHEET, sheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit" });
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 400, code: "ambiguous_sheet" });
  });

  it("rejects a JSON body without sheetUrl", async () => {
    await expect(readImportRequest(jsonRequest(JSON.stringify({ mode: "fast" })), LIMITS)).rejects.toMatchObject({ status: 400, code: "missing_sheet" });
  });

  it("rejects a JSON body that is not an object", async () => {
    await expect(readImportRequest(jsonRequest("not json"), LIMITS)).rejects.toMatchObject({ status: 400, code: "invalid_json" });
  });

  it("ignores a non-numeric budget", async () => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET, budgetCents: "five" }), LIMITS);
    expect(req.budgetCents).toBeUndefined();
  });

  it("accepts photos within the count and size limits", async () => {
    const req = await readImportRequest(await formRequest({ sheet: SHEET, photos: [bytes(100, "a.jpg"), bytes(3000, "b.zip")] }), LIMITS);
    expect(req.photos.map((p) => [p.name, p.data.length])).toEqual([
      ["a.jpg", 100],
      ["b.zip", 3000],
    ]);
  });
});

describe("readImportRequest: size limits before buffering (EC-A3)", () => {
  it("EC-A3: a multipart upload without Content-Length is refused with 411", async () => {
    const req = await formRequest({ sheet: SHEET }, { contentLength: null });
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 411, code: "length_required" });
  });

  it("EC-A3: a declared size above the upload cap is refused with 413 before the body is read", async () => {
    const req = await formRequest({ sheet: SHEET }, { contentLength: String(LIMITS.maxUploadBytes + 1) });
    const err: unknown = await readImportRequest(req, LIMITS).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413, code: "upload_too_large" });
    expect(String((err as Error).message)).toContain(`at most ${formatMb(LIMITS.maxUploadBytes)}`);
    expect(req.bodyUsed).toBe(false);
  });

  it.each(["abc", "-1", "1.5", "99999999999999999999"])("EC-A3: Content-Length %s is rejected as invalid", async (value) => {
    const req = await formRequest({ sheet: SHEET }, { contentLength: value });
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 400, code: "invalid_content_length" });
  });

  it("EC-A3: a JSON body declaring more than 64 KB is refused with 413", async () => {
    const req = jsonRequest(JSON.stringify({ sheetUrl: "x" }), String(64 * 1024 + 1));
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 413, code: "request_too_large" });
  });

  it("EC-A3: a JSON body without Content-Length is read only up to 64 KB", async () => {
    const big = JSON.stringify({ sheetUrl: "x", pad: "y".repeat(70 * 1024) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const req = new Request("http://localhost/api/imports", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 413, code: "request_too_large" });
  });

  it("EC-A3: more photos than the per-import cap are refused with a clear message", async () => {
    const photos = [1, 2, 3, 4].map((i) => bytes(10, `p${i}.jpg`));
    const err: unknown = await readImportRequest(await formRequest({ sheet: SHEET, photos }), LIMITS).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413, code: "too_many_photos" });
    expect(String((err as Error).message)).toContain("At most 3 photos per import; 4 were sent");
  });

  it("EC-A3: a ZIP above the ZIP limit is refused with 413", async () => {
    const req = await formRequest({ sheet: SHEET, photos: [bytes(LIMITS.maxZipBytes + 1, "all.zip")] });
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 413, code: "zip_too_large" });
  });

  it("EC-A3: a single photo above the per-file limit is refused with 413", async () => {
    const req = await formRequest({ sheet: SHEET, photos: [bytes(LIMITS.maxZipBytes + 1, "huge.jpg")] });
    await expect(readImportRequest(req, LIMITS)).rejects.toMatchObject({ status: 413, code: "photo_too_large" });
  });

  it("EC-A3: a sheet above the sheet limit is refused with 413", async () => {
    const req = await formRequest({ sheet: bytes(LIMITS.maxSheetBytes + 1, "big.csv") });
    const err: unknown = await readImportRequest(req, LIMITS).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 413, code: "sheet_too_large" });
    expect(String((err as Error).message)).toContain(formatMb(LIMITS.maxSheetBytes));
  });
});

describe("formatMb", () => {
  it.each([
    [120 * 1024 * 1024, "120 MB"],
    [1024 * 1024, "1 MB"],
    [1.5 * 1024 * 1024, "1.5 MB"],
  ])("formats %d bytes as %s", (n, expected) => {
    expect(formatMb(n)).toBe(expected);
  });
});
