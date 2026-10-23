import { describe, expect, it } from "vitest";
import { readImportRequest } from "./import-request";

function formRequest(fields: Record<string, string | File>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("http://localhost/api/imports", { method: "POST", body: form });
}

const SHEET = new File(["sku,title\nA-1,Mug\n"], "list.csv", { type: "text/csv" });

describe("readImportRequest", () => {
  it("reads the sheet, mode and budget from multipart form data", async () => {
    const req = await readImportRequest(formRequest({ sheet: SHEET, mode: "economy", budgetCents: "250" }));
    expect(req.sheet.name).toBe("list.csv");
    expect(req.sheet.data.toString("utf8")).toContain("A-1,Mug");
    expect(req.mode).toBe("economy");
    expect(req.budgetCents).toBe(250);
    expect(req.photos).toEqual([]);
  });

  it.each(["on", "true", "1"])("EC-F11: autoPublish=%s on the form turns auto-publish on", async (value) => {
    const req = await readImportRequest(formRequest({ sheet: SHEET, autoPublish: value }));
    expect(req.autoPublish).toBe(true);
  });

  it.each(["false", "off", "0", "yes please"])("EC-F11: autoPublish=%s on the form leaves auto-publish off", async (value) => {
    const req = await readImportRequest(formRequest({ sheet: SHEET, autoPublish: value }));
    expect(req.autoPublish).toBe(false);
  });

  it("EC-F11: a form without the field defaults to manual publishing", async () => {
    const req = await readImportRequest(formRequest({ sheet: SHEET }));
    expect(req.autoPublish).toBe(false);
    expect(req.mode).toBe("fast");
    expect(req.budgetCents).toBeUndefined();
  });

  it("rejects a form with neither a sheet nor a link", async () => {
    await expect(readImportRequest(formRequest({ mode: "fast" }))).rejects.toMatchObject({ status: 400, code: "missing_sheet" });
  });

  it("rejects a form that sends both a sheet and a link", async () => {
    await expect(readImportRequest(formRequest({ sheet: SHEET, sheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit" }))).rejects.toMatchObject({ status: 400, code: "ambiguous_sheet" });
  });

  it("rejects a JSON body without sheetUrl", async () => {
    const req = new Request("http://localhost/api/imports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "fast" }) });
    await expect(readImportRequest(req)).rejects.toMatchObject({ status: 400, code: "missing_sheet" });
  });

  it("ignores a non-numeric budget", async () => {
    const req = await readImportRequest(formRequest({ sheet: SHEET, budgetCents: "five" }));
    expect(req.budgetCents).toBeUndefined();
  });
});
