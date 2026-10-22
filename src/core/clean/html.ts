/**
 * Description HTML: allowlist sanitising (EC-B11), normalising broken markup (EC-B12) and a
 * plain-text projection for the model and the grounding corpus. Never throws on bad input.
 */
import sanitizeHtml from "sanitize-html";
import { issue, type Issue } from "../types";
import { isPlaceholder, normalizeText } from "./text";

export interface SanitizedHtml {
  html: string | null;
  text: string | null;
  unsafeRemoved: boolean;
  issues: Issue[];
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "h2",
  "h3",
  "h4",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
] as const;
const ALLOWED_TAG_SET: ReadonlySet<string> = new Set(ALLOWED_TAGS);
/** Tags renamed by the sanitiser rather than stripped. */
const RENAMED_TAGS: ReadonlySet<string> = new Set(["h1", "h5", "h6", "div"]);
const ANCHOR_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "title"]);

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  // rel/target are always overwritten by the anchor transform below, never taken from input.
  allowedAttributes: { a: ["href", "title", "rel", "target"] },
  allowedSchemes: ["http", "https"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    div: "p",
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
  // An anchor whose href was rejected (javascript:, ftp:, relative) is dropped; its text stays.
  exclusiveFilter: (frame) => (frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false),
};

const UNSAFE_PATTERNS: ReadonlyArray<RegExp> = [
  /<(script|iframe|object|embed|form|style|link|meta|applet|frame|frameset|base)\b/i,
  /\bsrcdoc\b/i,
  /<[a-z][^>]*[\s"'/]on[a-z]+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
];

const PROLOGUE_RE = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<!doctype\b[^>]*>/gi;
const HAS_TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const TAG_RE = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const ATTRIBUTE_RE = /[\s"'/]([a-zA-Z][a-zA-Z0-9-]*)\s*=/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  para: "¶",
  sect: "§",
  szlig: "ß",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  ocirc: "ô",
  oelig: "œ",
  aelig: "æ",
  oslash: "ø",
  aring: "å",
};
const ENTITY_RE = /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi;

export function sanitizeDescriptionHtml(raw: string | null | undefined): SanitizedHtml {
  if (raw === null || raw === undefined) return empty();
  const source = String(raw);
  if (isPlaceholder(source)) return empty();

  const issues: Issue[] = [];
  const stripped = stripPrologues(source);
  const hasTags = HAS_TAG_RE.test(stripped);
  const unsafeRemoved = hasTags && UNSAFE_PATTERNS.some((re) => re.test(source));
  if (unsafeRemoved) {
    issues.push(
      issue("html.unsafe_removed", "warn", "Unsafe HTML (scripts, event handlers or embeds) was removed from the description", {
        ec: "B11",
        field: "description",
        value: source,
      }),
    );
  }

  let html: string;
  if (hasTags) {
    try {
      html = sanitizeHtml(stripped, SANITIZE_OPTIONS).trim();
    } catch {
      issues.push(issue("html.sanitize_failed", "warn", "The description HTML could not be sanitised and was dropped", { field: "description" }));
      return { html: null, text: null, unsafeRemoved, issues };
    }
  } else {
    // Our own escaped markup needs no sanitising; sanitize-html would also unescape the quotes.
    html = plainTextToHtml(stripped);
  }
  if (hasTags && !unsafeRemoved && hasDisallowedMarkup(stripped)) {
    issues.push(
      issue("html.tags_stripped", "info", "Unsupported HTML tags or attributes were removed from the description", {
        ec: "B11",
        field: "description",
      }),
    );
  }

  const text = htmlToText(html);
  if (text === "") return { html: null, text: null, unsafeRemoved, issues };
  return { html, text, unsafeRemoved, issues };
}

/** Tags dropped, block boundaries turned into newlines, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  if (typeof html !== "string" || html === "") return "";
  const text = stripPrologues(html)
    .replace(/<(script|style|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|li|tr|h[1-6]|div|ul|ol|table|thead|tbody|blockquote|pre|section|article)\s*>/gi, "\n")
    .replace(/<\/\s*(td|th)\s*>/gi, " ")
    .replace(/<\/?[a-zA-Z!?][^>]*>/g, "");
  return normalizeText(decodeEntities(text))
    .replace(/\n+/g, "\n")
    .trim();
}

function empty(): SanitizedHtml {
  return { html: null, text: null, unsafeRemoved: false, issues: [] };
}

function stripPrologues(s: string): string {
  return s.replace(PROLOGUE_RE, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (match: string, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const cp = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return match;
      return String.fromCodePoint(cp);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Blank lines separate paragraphs, single newlines become line breaks. */
function plainTextToHtml(text: string): string {
  const normalized = decodeEntities(normalizeText(text));
  return normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** True when the input used tags or attributes outside the allowlist (and not merely renamed). */
function hasDisallowedMarkup(html: string): boolean {
  for (const tag of html.matchAll(TAG_RE)) {
    const name = tag[1].toLowerCase();
    if (!ALLOWED_TAG_SET.has(name) && !RENAMED_TAGS.has(name)) return true;
    for (const attribute of tag[2].matchAll(ATTRIBUTE_RE)) {
      if (name !== "a" || !ANCHOR_ATTRIBUTES.has(attribute[1].toLowerCase())) return true;
    }
  }
  return false;
}
