/**
 * Google Sheets link → sheet id and tab (EC-A23). Pure: no network. The server builds the
 * export URL from these parts, so a pasted link never reaches `fetch` as-is.
 */

export interface GoogleSheetRef {
  /** The document id from `/spreadsheets/d/<id>/…`, or the publish id from `/spreadsheets/d/e/<id>/pub…`. */
  sheetId: string;
  /** Tab id from `#gid=` or `?gid=`; null means the first tab. */
  gid: string | null;
  /** True for "Publish to the web" links (`/d/e/…`), which export through `/pub?output=csv` instead of `/export`. */
  published: boolean;
}

const HOSTS = new Set(["docs.google.com", "spreadsheets.google.com"]);
/** Optional `/u/<n>/` (multi-account) and `/a/<domain>/` (Workspace) segments precede `/spreadsheets`. */
const PATH_RE = /^(?:\/(?:u\/\d+|a\/[^/]+))?\/spreadsheets\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]{10,})(?:\/|$)/;
const GID_RE = /(?:^|[?&#])gid=(\d+)(?:$|[&#])/;

/** The export URL on docs.google.com for a parsed link; the host is fixed, so the input can never redirect the fetch. */
export function googleSheetCsvUrl(ref: GoogleSheetRef): string {
  const gid = ref.gid === null ? "" : `&gid=${ref.gid}`;
  if (ref.published) return `https://docs.google.com/spreadsheets/d/e/${ref.sheetId}/pub?output=csv${gid}`;
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/export?format=csv${gid}`;
}

export function parseGoogleSheetsUrl(raw: string): GoogleSheetRef | null {
  if (typeof raw !== "string") return null;
  const cleaned = unwrap(raw);
  if (cleaned === "") return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = PATH_RE.exec(url.pathname);
  if (!m) return null;
  // The hash is the tab the user was looking at; the query is what Google adds alongside it. Prefer the hash.
  const gid = GID_RE.exec(url.hash)?.[1] ?? GID_RE.exec(url.search)?.[1] ?? null;
  return { sheetId: m[2], gid, published: m[1] === "e/" };
}

/** Links arrive from chat and email wrapped in <…>, quotes or brackets and followed by punctuation. */
function unwrap(raw: string): string {
  let s = raw.trim().replace(/^[<("'[‘’“”]+/, "");
  const httpAt = s.search(/https?:\/\//i);
  if (httpAt > 0) s = s.slice(httpAt);
  s = s.split(/\s/, 1)[0];
  return s.replace(/[>)"'\]‘’“”.,;:!]+$/, "");
}
