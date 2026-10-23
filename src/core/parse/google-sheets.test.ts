import { describe, expect, it } from "vitest";
import { googleSheetCsvUrl, parseGoogleSheetsUrl, type GoogleSheetRef } from "./google-sheets";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const PUB = "2PACX-1vQ3kz9Z9ZsYj8nQqsQ2v1GQwT0y7y1C5sA6xW1jkb2vS3W";

describe("parseGoogleSheetsUrl (EC-A23)", () => {
  const accepted: Array<[string, string, GoogleSheetRef]> = [
    ["EC-A23: edit link with gid in the hash", `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1234`, { sheetId: ID, gid: "1234", published: false }],
    ["EC-A23: edit link with gid in the query and the hash", `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=55#gid=55`, { sheetId: ID, gid: "55", published: false }],
    ["EC-A23: the hash wins when query and hash disagree", `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1#gid=2`, { sheetId: ID, gid: "2", published: false }],
    ["EC-A23: share link without a gid", `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: bare document link", `https://docs.google.com/spreadsheets/d/${ID}`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: trailing slash only", `https://docs.google.com/spreadsheets/d/${ID}/`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: export link", `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx&gid=7`, { sheetId: ID, gid: "7", published: false }],
    ["EC-A23: htmlview and pub on a document id", `https://docs.google.com/spreadsheets/d/${ID}/pub?output=csv&gid=3`, { sheetId: ID, gid: "3", published: false }],
    ["EC-A23: publish-to-web link (/d/e/)", `https://docs.google.com/spreadsheets/d/e/${PUB}/pubhtml#gid=9`, { sheetId: PUB, gid: "9", published: true }],
    ["EC-A23: publish-to-web CSV link", `https://docs.google.com/spreadsheets/d/e/${PUB}/pub?gid=0&single=true&output=csv`, { sheetId: PUB, gid: "0", published: true }],
    ["EC-A23: multi-account path", `https://docs.google.com/spreadsheets/u/1/d/${ID}/edit#gid=0`, { sheetId: ID, gid: "0", published: false }],
    ["EC-A23: multi-account prefix path", `https://docs.google.com/u/0/spreadsheets/d/${ID}/edit`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: Workspace domain path", `https://docs.google.com/a/example.com/spreadsheets/d/${ID}/edit`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: http and upper-case host", `HTTP://DOCS.GOOGLE.COM/spreadsheets/d/${ID}/edit`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: no scheme", `docs.google.com/spreadsheets/d/${ID}/edit#gid=4`, { sheetId: ID, gid: "4", published: false }],
    ["EC-A23: surrounding whitespace and angle brackets", `  <https://docs.google.com/spreadsheets/d/${ID}/edit#gid=12>  `, { sheetId: ID, gid: "12", published: false }],
    ["EC-A23: trailing punctuation from a sentence", `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing).`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: text before the link", `Here you go: https://docs.google.com/spreadsheets/d/${ID}/edit then more words`, { sheetId: ID, gid: null, published: false }],
    ["EC-A23: smart quotes around the link", `\u201chttps://docs.google.com/spreadsheets/d/${ID}/edit\u201d`, { sheetId: ID, gid: null, published: false }],
  ];

  it.each(accepted)("%s", (_name, url, expected) => {
    expect(parseGoogleSheetsUrl(url)).toEqual(expected);
  });

  const rejected: Array<[string, string]> = [
    ["EC-A23: a Google Doc", `https://docs.google.com/document/d/${ID}/edit`],
    ["EC-A23: a Drive file link", `https://drive.google.com/file/d/${ID}/view`],
    ["EC-A23: a look-alike host", `https://docs.google.com.evil.example/spreadsheets/d/${ID}/edit`],
    ["EC-A23: a host with the real one in the path", `https://evil.example/docs.google.com/spreadsheets/d/${ID}/edit`],
    ["EC-A23: a user-info trick", `https://docs.google.com@evil.example/spreadsheets/d/${ID}/edit`],
    ["EC-A23: a non-http scheme", `ftp://docs.google.com/spreadsheets/d/${ID}/edit`],
    ["EC-A23: javascript scheme", `javascript:alert(1)//docs.google.com/spreadsheets/d/${ID}`],
    ["EC-A23: an id that is too short", "https://docs.google.com/spreadsheets/d/abc/edit"],
    ["EC-A23: no id at all", "https://docs.google.com/spreadsheets/d/"],
    ["EC-A23: a random sentence", "please import my sheet"],
    ["EC-A23: empty", ""],
    ["EC-A23: whitespace", "   "],
    ["EC-A23: a plain file path", "C:\\Users\\me\\sheet.csv"],
  ];

  it.each(rejected)("%s → null", (_name, url) => {
    expect(parseGoogleSheetsUrl(url)).toBeNull();
  });

  it("gid must be numeric; anything else means the first tab", () => {
    expect(parseGoogleSheetsUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=abc`)?.gid).toBeNull();
    expect(parseGoogleSheetsUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=`)?.gid).toBeNull();
  });
});

describe("googleSheetCsvUrl (EC-A23)", () => {
  it("EC-A23: builds the fixed-host export URL with an optional gid", () => {
    expect(googleSheetCsvUrl({ sheetId: ID, gid: null, published: false })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
    expect(googleSheetCsvUrl({ sheetId: ID, gid: "42", published: false })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=42`);
    expect(googleSheetCsvUrl({ sheetId: PUB, gid: "0", published: true })).toBe(`https://docs.google.com/spreadsheets/d/e/${PUB}/pub?output=csv&gid=0`);
  });

  it("EC-A23: the URL is built only from validated parts, never from the pasted text", () => {
    const ref = parseGoogleSheetsUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?format=xlsx&gid=1#gid=1`);
    expect(ref).not.toBeNull();
    if (!ref) return;
    const url = new URL(googleSheetCsvUrl(ref));
    expect(url.hostname).toBe("docs.google.com");
    expect(url.searchParams.get("format")).toBe("csv");
  });
});
