import { describe, expect, it } from "vitest";
import { fetchGoogleSheetCsv, fileNameFrom, PRIVATE_SHEET_MESSAGE } from "./fetch-google-sheet";
import { HttpError } from "./http";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const LINK = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=77`;
const EXPORT = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=77`;
const CSV = "sku,name,price\nA1,Vase,12.50\n";
const MAX = 1024;

type Step = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** A fetch stand-in that records every URL it is asked for and answers from a script, one response per hop. */
function fakeFetch(steps: Step[]): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return step(url, init);
  };
  return { fetchImpl, calls };
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error("expected the fetch to fail");
}

describe("fetchGoogleSheetCsv (EC-A23)", () => {
  it("EC-A23: fetches exactly the fixed-host export URL and names the file from Content-Disposition", async () => {
    const { fetchImpl, calls } = fakeFetch([() => new Response(CSV, { status: 200, headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=\"Price list - Sheet1.csv\"; filename*=UTF-8''Price%20list%20-%20Sheet1.csv" } })]);
    const sheet = await fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX });
    expect(calls).toEqual([EXPORT]);
    expect(sheet.data.toString("utf8")).toBe(CSV);
    expect(sheet.fileName).toBe("Price list - Sheet1.csv");
    expect(sheet.sheetId).toBe(ID);
    expect(sheet.gid).toBe("77");
  });

  it("EC-A23: the request never follows redirects on its own and sends no credentials", async () => {
    let init: RequestInit | undefined;
    const { fetchImpl } = fakeFetch([
      (_url, i) => {
        init = i;
        return new Response(CSV, { status: 200 });
      },
    ]);
    await fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX });
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBeUndefined();
  });

  it("EC-A23: falls back to <sheet id>.csv when Google sends no file name", async () => {
    const { fetchImpl } = fakeFetch([() => new Response(CSV, { status: 200 })]);
    const sheet = await fetchGoogleSheetCsv(`https://docs.google.com/spreadsheets/d/${ID}/edit`, { fetchImpl, maxBytes: MAX });
    expect(sheet.fileName).toBe(`${ID}.csv`);
    expect(sheet.gid).toBeNull();
  });

  it("EC-A23: a redirect to googleusercontent.com is followed; the final body is used", async () => {
    const { fetchImpl, calls } = fakeFetch([() => redirect("https://doc-0s-3c-sheets.googleusercontent.com/export/abc"), () => new Response(CSV, { status: 200 })]);
    const sheet = await fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX });
    expect(calls).toEqual([EXPORT, "https://doc-0s-3c-sheets.googleusercontent.com/export/abc"]);
    expect(sheet.data.toString("utf8")).toBe(CSV);
  });

  const refused: Array<[string, string]> = [
    ["EC-A23: a redirect to a non-Google host is refused", "https://evil.example/sheet.csv"],
    ["EC-A23: a look-alike host is refused", "https://docs.google.com.evil.example/x"],
    ["EC-A23: a downgrade to http is refused", "http://docs.google.com/spreadsheets/d/x/export?format=csv"],
  ];

  it.each(refused)("%s", async (_name, location) => {
    const { fetchImpl, calls } = fakeFetch([() => redirect(location), () => new Response(CSV, { status: 200 })]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(502);
    expect(err.code).toBe("sheet_redirect_refused");
    expect(calls).toHaveLength(1);
  });

  it("EC-A23: gives up after too many redirects", async () => {
    const { fetchImpl } = fakeFetch([() => redirect(EXPORT)]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.code).toBe("sheet_fetch_failed");
    expect(err.message).toMatch(/too many times/);
  });

  it("EC-A23: a sheet over the size cap is abandoned mid-stream with a 413", async () => {
    const big = "x".repeat(MAX * 3);
    const { fetchImpl } = fakeFetch([() => new Response(big, { status: 200 })]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(413);
    expect(err.code).toBe("sheet_too_large");
    expect(err.message).toMatch(/larger than/);
  });

  it("EC-A23: a declared Content-Length over the cap is refused before reading", async () => {
    let read = false;
    // highWaterMark 0: the stream only pulls when someone actually reads it.
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          read = true;
        },
      },
      { highWaterMark: 0 },
    );
    const { fetchImpl } = fakeFetch([() => new Response(stream, { status: 200, headers: { "content-length": String(MAX * 10) } })]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.code).toBe("sheet_too_large");
    expect(read).toBe(false);
  });

  it("EC-A23: times out with a 504 when Google does not answer", async () => {
    const { fetchImpl } = fakeFetch([
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX, timeoutMs: 20 }));
    expect(err.status).toBe(504);
    expect(err.code).toBe("sheet_timeout");
  });

  it("EC-A23: a network failure is a 502 with a retry hint, never a stack trace", async () => {
    const { fetchImpl } = fakeFetch([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(502);
    expect(err.code).toBe("sheet_fetch_failed");
  });

  it("EC-A23: a 404 names the problem", async () => {
    const { fetchImpl } = fakeFetch([() => new Response("Not Found", { status: 404 })]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(404);
    expect(err.code).toBe("sheet_not_found");
  });

  it("EC-A23: an empty export is rejected like an empty upload", async () => {
    const { fetchImpl } = fakeFetch([() => new Response("", { status: 200 })]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.code).toBe("empty_file");
  });

  it("EC-A23: a link that is not a Google Sheet fails before any request is made", async () => {
    const { fetchImpl, calls } = fakeFetch([() => new Response(CSV, { status: 200 })]);
    const err = await failure(fetchGoogleSheetCsv("https://example.com/sheet.csv", { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_sheet_url");
    expect(calls).toEqual([]);
  });
});

describe("fetchGoogleSheetCsv: private sheets (EC-A24)", () => {
  const loginPage = '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head><body>Sign in</body></html>';
  const privateCases: Array<[string, Step]> = [
    ["EC-A24: a redirect to the Google login page", () => redirect(`https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(EXPORT)}`)],
    ["EC-A24: an HTML login page served with 200", () => new Response(loginPage, { status: 200, headers: { "content-type": "text/html" } })],
    ["EC-A24: HTTP 401", () => new Response("", { status: 401 })],
    ["EC-A24: HTTP 403", () => new Response("", { status: 403 })],
  ];

  it.each(privateCases)("%s → the share-settings message", async (_name, step) => {
    const { fetchImpl } = fakeFetch([step]);
    const err = await failure(fetchGoogleSheetCsv(LINK, { fetchImpl, maxBytes: MAX }));
    expect(err.status).toBe(403);
    expect(err.code).toBe("sheet_private");
    expect(err.message).toBe("This sheet is not shared publicly. In Google Sheets choose Share → Anyone with the link → Viewer and try again.");
    expect(err.message).toBe(PRIVATE_SHEET_MESSAGE);
  });
});

describe("fileNameFrom", () => {
  const cases: Array<[string, string | null, string | null]> = [
    ["RFC 5987 name wins over the plain one", "attachment; filename=\"x.csv\"; filename*=UTF-8''Gr%C3%B6%C3%9Fe%20-%20Tab.csv", "Größe - Tab.csv"],
    ["plain quoted name", 'attachment; filename="Price list - Sheet1.csv"', "Price list - Sheet1.csv"],
    ["unquoted name", "attachment; filename=prices.csv", "prices.csv"],
    ["path separators and control characters are removed (a quoted-pair backslash unescapes first)", 'attachment; filename="..\\\\evil/\u0001name.csv"', ".. evil name.csv"],
    ["a missing extension is added", 'attachment; filename="Price list"', "Price list.csv"],
    ["a very long name is bounded", `attachment; filename="${"a".repeat(300)}.csv"`, `${"a".repeat(120)}.csv`],
    ["bad percent-encoding falls back to the plain name", "attachment; filename=\"ok.csv\"; filename*=UTF-8''%E0%A4%A", "ok.csv"],
    ["no header", null, null],
    ["no file name in the header", "inline", null],
  ];

  it.each(cases)("%s", (_name, header, expected) => {
    expect(fileNameFrom(header)).toBe(expected);
  });
});
