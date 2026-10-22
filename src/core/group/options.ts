/**
 * Option tokens hidden inside titles (EC-C5, EC-B18): "Terracotta Planter 20cm Blue" carries a
 * size and a colour that make the row a variant of "Terracotta Planter". Detection prefers
 * trailing tokens because suppliers append the variant to the product name. A colour that opens
 * the title ("Terracotta Planter", "Blue Mug") describes the product and is never an option.
 */
import { extractColorTokens } from "../clean/color";
import { normalizeSizeValue } from "../clean/row";
import { foldForMatch, normalizeText } from "../clean/text";
import { parseLength } from "../clean/units";

export interface InferredOptions {
  options: Record<string, string>;
  baseTitle: string;
}

interface Span {
  start: number;
  end: number;
}

interface Found extends Span {
  value: string;
}

type Valuer = (m: RegExpExecArray, text: string) => string | null;
type Detector = readonly [RegExp, Valuer];

const LB = String.raw`(?<![\p{L}\p{N}])`;
const RB = String.raw`(?![\p{L}\p{N}])`;
const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;
const LENGTH_UNIT = String.raw`(cm|mm|m|inches|inch|in|")`;
const PACK_WORDS = "set|pack|pk|pcs|pieces|piece|pc|stück|stueck|stk|teilig|tlg|pièces";
const SEP = String.raw`[,;:/|\-–—]`;

const packValue: Valuer = (m) => {
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
};

const PACK: Detector[] = [
  [new RegExp(`${LB}(?:set|pack|lot|box|bundle)\\s+(?:of|de|von|à|a)\\s+(\\d{1,3})${RB}`, "giu"), packValue],
  [new RegExp(`${LB}(\\d{1,3})\\s*(?:er)?[\\s-]*(?:${PACK_WORDS})${RB}`, "giu"), packValue],
];

const ML_PER_UNIT: Readonly<Record<string, number>> = { ml: 1, cl: 10, dl: 100 };

const CAPACITY: Detector[] = [
  [
    new RegExp(`${LB}${NUM}\\s*(ml|cl|dl|l|ltr|liter|liters|litre|litres)${RB}`, "giu"),
    (m) => {
      const ml = Math.round(Number(m[1].replace(",", ".")) * (ML_PER_UNIT[m[2].toLowerCase()] ?? 1000));
      if (!Number.isFinite(ml) || ml <= 0) return null;
      return ml >= 1000 ? `${Number((ml / 1000).toFixed(2))} l` : `${ml} ml`;
    },
  ],
];

const unitWord = (u: string): string => (u === '"' ? "in" : u.toLowerCase());

/** "7 in Blue" is a preposition; "7.9 in" or "7 in" at the end of the title is a length. */
function inchAllowed(m: RegExpExecArray, number: string, text: string): boolean {
  if (/[.,]/.test(number)) return true;
  const rest = text.slice(m.index + m[0].length);
  return new RegExp(`^\\s*(?:$|${SEP}|[()\\[\\]])`, "u").test(rest);
}

const SIZE: Detector[] = [
  [
    new RegExp(`${LB}(?:[øØ⌀]\\s*)?${NUM}\\s*(?:x|×|\\*)\\s*${NUM}(?:\\s*(?:x|×|\\*)\\s*${NUM})?\\s*${LENGTH_UNIT}${RB}`, "giu"),
    (m, text) => {
      const unit = unitWord(m[4]);
      if (unit === "in" && !inchAllowed(m, m[3] ?? m[2], text)) return null;
      const cms = [m[1], m[2], m[3]].filter((n): n is string => typeof n === "string").map((n) => parseLength(`${n} ${unit}`)?.cm);
      return cms.every((c): c is number => typeof c === "number") ? `${cms.join(" x ")} cm` : null;
    },
  ],
  // A single dimension label ("L 20 cm", "H: 30cm") is part of the token, so it leaves the title with it.
  [
    new RegExp(`${LB}(?:(?:[øØ⌀]|[hwldt](?=\\s*[:=.]?\\s*\\d))\\s*[:=.]?\\s*)?${NUM}\\s*${LENGTH_UNIT}${RB}`, "giu"),
    (m, text) => {
      const unit = unitWord(m[2]);
      if (unit === "in" && !inchAllowed(m, m[1], text)) return null;
      return normalizeSizeValue(`${m[1]} ${unit}`);
    },
  ],
  [
    new RegExp(`${LB}(?:size|größe|groesse|grösse|taille|gr\\.)\\s*:?\\s*([\\p{L}\\p{N}.,]{1,8}(?:\\s*(?:cm|mm|in|inch))?)${RB}`, "giu"),
    (m) => normalizeSizeValue(m[1]),
  ],
  [new RegExp(`${LB}(xxs|xs|xxxl|xxl|xl|[2-5]xl)${RB}`, "giu"), (m) => normalizeSizeValue(m[1])],
  // Single letters only in upper case and never as a dimension label ("L 20 cm") or after an apostrophe.
  [/(?<![\p{L}\p{N}'’&/])([SML])(?![\p{L}\p{N}])(?!\s*[:=.]?\s*\d)/gu, (m) => normalizeSizeValue(m[1])],
  [new RegExp(`${LB}(x-?small|x-?large|extra small|extra large|small|medium|large)${RB}`, "giu"), (m) => normalizeSizeValue(m[1])],
];

const TOKEN_RE = /[\p{L}\p{N}\p{M}]+/gu;

interface Token extends Span {
  folded: string;
}

export function inferOptionsFromTitle(title: string): InferredOptions {
  if (typeof title !== "string") return { options: {}, baseTitle: "" };
  const text = normalizeText(title);
  if (text === "") return { options: {}, baseTitle: "" };

  const spans: Span[] = [];
  const free = (s: Span): boolean => !spans.some((t) => s.start < t.end && t.start < s.end);
  const claim = (f: Found | null): string | null => {
    if (f) spans.push(f);
    return f ? f.value : null;
  };
  // Packs first so "Set of 4 in Blue" never reads "4 in" as inches.
  const pack = claim(lastMatch(text, PACK, free));
  const capacity = claim(lastMatch(text, CAPACITY, free));
  const size = claim(lastMatch(text, SIZE, free));
  const color = claim(findColor(text, free));

  const options: Record<string, string> = {};
  if (size !== null) options.size = size;
  if (capacity !== null) options.capacity = capacity;
  if (color !== null) options.color = color;
  if (pack !== null) options.pack = pack;
  const baseTitle = tidy(cut(text, spans));
  return { options, baseTitle: baseTitle === "" ? text : baseTitle };
}

export function stripOptionTokens(title: string): string {
  return inferOptionsFromTitle(title).baseTitle;
}

/** The trailing-most free match: greatest end, then the longest span, so "Size 20 cm" wins over "20 cm". */
function lastMatch(text: string, detectors: Detector[], free: (s: Span) => boolean): Found | null {
  let best: Found | null = null;
  for (const [re, toValue] of detectors) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      if (m[0] === "") {
        re.lastIndex++;
        continue;
      }
      const span = { start: m.index, end: m.index + m[0].length };
      if (!free(span)) continue;
      if (best && (best.end > span.end || (best.end === span.end && best.start <= span.start))) continue;
      const value = toValue(m, text);
      if (value !== null && value !== "") best = { ...span, value };
    }
  }
  return best;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push({ start: m.index, end: m.index + m[0].length, folded: foldForMatch(m[0]) });
  }
  return out;
}

/** The last colour mentioned is the variant colour; its span is located by scanning windows from the end. */
function findColor(text: string, free: (s: Span) => boolean): Found | null {
  const all = extractColorTokens(text);
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  const tokens = tokenize(text);
  for (let start = tokens.length - 1; start >= 0; start--) {
    for (let len = Math.min(3, tokens.length - start); len >= 1; len--) {
      const window = tokens.slice(start, start + len);
      const span = { start: window[0].start, end: window[len - 1].end };
      if (!free(span) || !isColorSpan(window.map((t) => t.folded), last)) continue;
      // A leading colour word is part of the product name, not a variant.
      if (start === 0) return null;
      return { ...withLeadIn(span, tokens[start - 1], text), value: last };
    }
  }
  return null;
}

const COLOR_LEAD_INS: ReadonlySet<string> = new Set(["in", "en", "im", "colour", "color", "farbe", "couleur", "coloris"]);

/** "Mug in Blue", "Tasse in Blau": the preposition goes with the colour, or it would dangle in the title. */
function withLeadIn(span: Span, previous: Token | undefined, text: string): Span {
  if (!previous || !COLOR_LEAD_INS.has(previous.folded)) return span;
  if (!/^\s*$/.test(text.slice(previous.end, span.start))) return span;
  return { start: previous.start, end: span.end };
}

/** True when the words form exactly one colour and none of them is a non-colour word riding along. */
function isColorSpan(words: string[], color: string): boolean {
  const yields = (ws: string[]): string[] => extractColorTokens(ws.join(" "));
  const exact = (ws: string[]): boolean => {
    const e = yields(ws);
    return e.length === 1 && e[0] === color;
  };
  if (!exact(words)) return false;
  for (let cut = 1; cut < words.length; cut++) {
    if (exact(words.slice(0, cut)) && yields(words.slice(cut)).length === 0) return false;
    if (exact(words.slice(cut)) && yields(words.slice(0, cut)).length === 0) return false;
  }
  return true;
}

function cut(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    out += `${text.slice(pos, s.start)} `;
    pos = s.end;
  }
  return out + text.slice(pos);
}

const SEP_RUN = new RegExp(`(\\s*${SEP})(?:\\s*${SEP})+`, "gu");
const OPEN_BRACKET_SEPS = new RegExp(`([(\\[])\\s*(?:${SEP}\\s*)+`, "gu");
const CLOSE_BRACKET_SEPS = new RegExp(`\\s*(?:${SEP}\\s*)+([)\\]])`, "gu");
const LEADING_SEPS = new RegExp(`^(?:\\s*${SEP})+\\s*`, "u");
const TRAILING_SEPS = new RegExp(`(?:\\s*${SEP})+\\s*$`, "u");

/** Remove the separators and brackets that held the removed tokens; single hyphens inside words stay. */
function tidy(s: string): string {
  return s
    .replace(OPEN_BRACKET_SEPS, "$1")
    .replace(CLOSE_BRACKET_SEPS, "$1")
    .replace(/[(\[]\s*[)\]]/gu, " ")
    .replace(SEP_RUN, "$1")
    .replace(LEADING_SEPS, "")
    .replace(TRAILING_SEPS, "")
    .replace(/\s+/g, " ")
    .trim();
}
