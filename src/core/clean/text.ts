/**
 * Text normalisation for raw cell values: invisible characters and placeholders (EC-B13),
 * mojibake repair (EC-A4) and the accent-insensitive comparison form used by the grounding
 * validator and photo matching. Everything here is pure and never throws on bad input.
 */
import iconv from "iconv-lite";

const PLACEHOLDERS: ReadonlySet<string> = new Set([
  "",
  "-",
  "–",
  "—",
  "n/a",
  "n.a.",
  "na",
  "null",
  "none",
  "nil",
  "tbd",
  "tba",
  "?",
  "#n/a",
  "#ref!",
  "#value!",
  "#div/0!",
  "#name?",
  "#num!",
  "unknown",
  "k.a.",
  "keine angabe",
  "nicht verfügbar",
  "non applicable",
  "s/o",
  "sans objet",
  "-/-",
  ".",
]);

// Runs made only of dashes, dots, underscores, slashes or question marks ("--", "...", "???").
const PLACEHOLDER_SYMBOLS = /^[-–—_.?/\s]+$/;

const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD]/g;
const SPACE_LIKE = /[\u00A0\u2007\u202F\u2009]/g;
// C0 controls except \n and \t, plus DEL.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function normalizeText(raw: string): string {
  if (typeof raw !== "string" || raw === "") return "";
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(SPACE_LIKE, " ")
    .replace(INVISIBLE, "")
    .replace(CONTROL, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isPlaceholder(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).normalize("NFC").replace(INVISIBLE, "").trim().toLowerCase();
  return PLACEHOLDERS.has(s) || PLACEHOLDER_SYMBOLS.test(s);
}

/** Repair, then normalise; placeholders become null so the model never sees "N/A" as a value. */
export function cleanCell(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  // Repair runs before normalisation: an NBSP inside a mojibake sequence ("Â\u00A0") must
  // still be there when the bytes are re-interpreted.
  const normalized = normalizeText(repairMojibake(String(raw)).text);
  return isPlaceholder(normalized) ? null : normalized;
}

// ---------------------------------------------------------------------------
// Mojibake (EC-A4): UTF-8 bytes that were decoded as Windows-1252 / Latin-1.
// ---------------------------------------------------------------------------

/**
 * Characters a Windows-1252 decoder produces for bytes 0x80–0xBF: the only characters that
 * can follow a UTF-8 lead byte inside a mojibake sequence.
 */
const CONTINUATION_CLASS =
  "[\\u0080-\\u00BF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039" +
  "\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A" +
  "\\u0153\\u017E\\u0178]";
/** A possible lead byte (Â…ô) directly followed by a continuation-range character. */
const MARKER_RE = new RegExp(`[\\u00C2-\\u00F4]${CONTINUATION_CLASS}`, "g");
const REPLACEMENT_RE = /\uFFFD/g;

const MAX_REPAIR_PASSES = 3;

function countMatches(s: string, re: RegExp): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

/**
 * Re-interpret runs of Windows-1252 characters as UTF-8 where they form valid sequences,
 * leaving everything else untouched, so strings mixing damaged and clean parts are handled.
 */
export function repairMojibake(s: string): { text: string; repaired: boolean } {
  if (typeof s !== "string" || s.length < 2) return { text: s, repaired: false };
  const markersBefore = countMatches(s, MARKER_RE);
  if (markersBefore === 0) return { text: s, repaired: false };
  let current = s;
  try {
    // Double-encoded text needs more than one pass; the chain is judged as a whole below.
    for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
      const candidate = decodeUtf8OverCp1252(current);
      if (candidate === null || candidate === current) break;
      if (countMatches(candidate, REPLACEMENT_RE) > countMatches(s, REPLACEMENT_RE)) break;
      current = candidate;
      if (countMatches(current, MARKER_RE) === 0) break;
    }
  } catch {
    return { text: s, repaired: false };
  }
  // Accept only when nothing was lost and the text really got cleaner (EC-A4 rule).
  if (current === s || countMatches(current, MARKER_RE) >= markersBefore) return { text: s, repaired: false };
  return { text: current, repaired: true };
}

/** One byte per UTF-16 code unit; 0x00 marks a character Windows-1252 cannot encode. */
function cp1252Units(s: string): Uint8Array | null {
  const bytes = iconv.encode(s, "win1252");
  if (bytes.length !== s.length) return null;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (bytes[i] === 0x3f && code !== 0x3f) {
      // C1 controls come from a Latin-1 decode of the five bytes cp1252 leaves undefined.
      bytes[i] = code >= 0x80 && code <= 0x9f ? code : 0x00;
    }
  }
  return bytes;
}

function isContinuation(b: number, lo = 0x80, hi = 0xbf): boolean {
  return b >= lo && b <= hi;
}

/**
 * Only decode into scripts that plausibly occur in supplier data (Latin, Greek, Cyrillic,
 * BMP symbols/CJK, emoji). German letters such as ß/Ü followed by a dash or quote would
 * otherwise "decode" into Syriac or NKo.
 */
function plausible(cp: number, lead: number): boolean {
  if (lead <= 0xdf) return lead <= 0xd3 && cp >= 0xa0;
  if (lead <= 0xef) return cp < 0xe000 || (cp >= 0xf900 && cp < 0xfffd);
  return cp < 0xf0000;
}

function decodeUtf8OverCp1252(s: string): string | null {
  const bytes = cp1252Units(s);
  if (bytes === null) return null;
  const n = s.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const b0 = bytes[i];
    const len = b0 >= 0xc2 && b0 <= 0xdf ? 2 : b0 >= 0xe0 && b0 <= 0xef ? 3 : b0 >= 0xf0 && b0 <= 0xf4 ? 4 : 0;
    if (len > 0 && i + len <= n) {
      const b1 = bytes[i + 1];
      let cp = -1;
      if (len === 2 && isContinuation(b1)) {
        cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      } else if (len === 3) {
        const b2 = bytes[i + 2];
        const lo = b0 === 0xe0 ? 0xa0 : 0x80;
        const hi = b0 === 0xed ? 0x9f : 0xbf;
        if (isContinuation(b1, lo, hi) && isContinuation(b2)) {
          cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
        }
      } else if (len === 4) {
        const b2 = bytes[i + 2];
        const b3 = bytes[i + 3];
        const lo = b0 === 0xf0 ? 0x90 : 0x80;
        const hi = b0 === 0xf4 ? 0x8f : 0xbf;
        if (isContinuation(b1, lo, hi) && isContinuation(b2) && isContinuation(b3)) {
          cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
        }
      }
      if (cp >= 0 && plausible(cp, b0)) {
        out += String.fromCodePoint(cp);
        i += len;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comparison form and model budget
// ---------------------------------------------------------------------------

const FOLD_MAP: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ł: "l",
};

/** Lower-case, accent-stripped, punctuation collapsed to single spaces. Deterministic and cheap. */
export function foldForMatch(s: string): string {
  if (typeof s !== "string" || s === "") return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ßæœøđł]/g, (c) => FOLD_MAP[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const TRUNCATION_SUFFIX = " [truncated]";
const DEFAULT_MODEL_MAX = 20_000;
const WORD_BOUNDARY_LOOKBACK = 200;

/** Cap text sent to the model; the result never exceeds `max` characters. */
export function truncateForModel(
  text: string,
  max: number = DEFAULT_MODEL_MAX,
): { text: string; truncated: boolean } {
  if (typeof text !== "string") return { text: "", truncated: false };
  if (!Number.isFinite(max) || text.length <= max) return { text, truncated: false };
  const budget = Math.max(0, Math.floor(max) - TRUNCATION_SUFFIX.length);
  let cut = text.slice(0, budget);
  const lastSpace = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  if (lastSpace > 0 && lastSpace >= budget - WORD_BOUNDARY_LOOKBACK) cut = cut.slice(0, lastSpace);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return { text: cut.trimEnd() + TRUNCATION_SUFFIX, truncated: true };
}
