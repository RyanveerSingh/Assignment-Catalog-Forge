import { htmlToText } from "@/core/clean/html";
import { foldForMatch } from "@/core/clean/text";

/**
 * Removing a blocked claim from the listing without leaving wreckage (EC-D2, B15). Cutting
 * "organic" out of "100% organic." leaves "100% ."; cutting "scratch-proof" out of "UV-stable,
 * scratch-proof and kid-friendly" can leave "and -friendly". Each removal marks its spot, and the
 * sentence around the mark is repaired (dangling "and", stray commas, empty brackets) or, when it no
 * longer reads as a sentence, dropped whole.
 */

const MARK = "\u0001";
const CONJUNCTIONS = "and|or|but|nor|&|und|oder|aber|sowie|et|ou|mais";
/** Words that cannot end a phrase: what followed them was the removed claim. */
const DANGLING: ReadonlySet<string> = new Set([
  "a", "an", "the", "of", "for", "with", "without", "in", "on", "to", "at", "by", "from", "is", "are", "be", "was", "were", "very", "fully", "so", "too", "also",
  "completely", "totally", "extremely", "highly", "truly", "can", "will", "its", "it's", "is", "being", "made", "stay", "remain", "remains", "stays", "keep", "kept",
  "ein", "eine", "der", "die", "das", "mit", "für", "fur", "ist", "sehr", "aus", "und", "absolut", "komplett",
  "un", "une", "de", "du", "des", "la", "le", "les", "en", "au", "aux", "est", "très", "tres", "et",
  // A negation whose object was removed: "Frost-resistant, not <frost-proof>".
  "not", "no", "non", "never", "nicht", "kein", "keine", "pas", "sans", "ohne",
]);
const LEADING_CONJ_RE = new RegExp(`^(?:${CONJUNCTIONS})\\b[\\s,]*`, "iu");
const TRAILING_CONJ_RE = new RegExp(`[\\s,]*\\b(?:${CONJUNCTIONS})$`, "iu");
const ADJACENT_MARKS_RE = new RegExp(`${MARK}(?:[\\s,/]*(?:\\b(?:${CONJUNCTIONS})\\b)?[\\s,/]*${MARK})+`, "giu");

/** A pattern matching one phrase in listing text, hyphen-, space- and punctuation-tolerant: "frost proof" ↔ "Frost-proof". */
export function phrasePattern(folded: string, withNegation = false): string {
  const words = folded.split(" ").filter(Boolean).map(escapeRegExp);
  // A contraction, a German or French negation, or a plain "not" may precede a denied term.
  const negation = withNegation ? "(?:\\b(?:not|no|non|never|without|nicht|kein|keine|ohne|sans|pas|\\p{L}+n['’]?t)\\s+)?" : "";
  return `${negation}(?<![\\p{L}\\p{N}])${words.join("[^\\p{L}\\p{N}<>]{1,3}")}(?![\\p{L}\\p{N}])`;
}

/** One regex for several phrases, longest first so "weather proof" wins over "weather". */
export function phrasesRegex(folded: readonly string[], withNegation = false): RegExp {
  const sorted = [...new Set(folded.filter(Boolean))].sort((a, b) => b.length - a.length);
  return new RegExp(sorted.map((p) => phrasePattern(p, withNegation)).join("|"), "giu");
}

/** Removes every match from the description HTML; broken sentences are repaired or dropped. Null when nothing is left. */
export function removeFromHtml(html: string, pattern: RegExp): string | null {
  const marked = html.replace(pattern, MARK);
  if (!marked.includes(MARK)) return html;
  const parts = marked.replace(ADJACENT_MARKS_RE, MARK).split(/(<[^>]*>)/);
  const repaired = parts.map((part) => (part.startsWith("<") || !part.includes(MARK) ? part : repairSegment(part))).join("");
  const cleaned = removeEmptyElements(repaired);
  return htmlToText(cleaned) === "" ? null : cleaned;
}

/** Removes every match from a single line (title, attribute value). A line is never dropped, only tidied. */
export function removeFromLine(text: string, pattern: RegExp): string {
  const marked = text.replace(pattern, MARK);
  if (!marked.includes(MARK)) return text;
  const collapsed = marked.replace(ADJACENT_MARKS_RE, MARK);
  return repairSentence(collapsed) ?? tidyFragment(collapsed.split(MARK).join(" "));
}

/** The parts of a listing a removal touches. Mutated in place by `stripFromListing`. */
export interface ListingText {
  title: string;
  descriptionHtml: string | null;
  descriptionText: string;
  attributes: Record<string, string>;
}

/** Removes every phrase (folded spellings) from title, description and attributes; an emptied attribute is dropped. */
export function stripFromListing(listing: ListingText, phrases: readonly string[], withNegation = false): void {
  if (phrases.filter(Boolean).length === 0) return;
  const pattern = phrasesRegex(phrases, withNegation);
  listing.title = removeFromLine(listing.title, pattern);
  if (listing.descriptionHtml) {
    listing.descriptionHtml = removeFromHtml(listing.descriptionHtml, pattern);
    listing.descriptionText = listing.descriptionHtml ? htmlToText(listing.descriptionHtml) : "";
  } else {
    listing.descriptionText = removeFromLine(listing.descriptionText, pattern);
  }
  for (const [k, v] of Object.entries(listing.attributes)) {
    const cleaned = removeFromLine(v, pattern);
    if (cleaned) listing.attributes[k] = cleaned;
    else delete listing.attributes[k];
  }
}

function repairSegment(segment: string): string {
  // Keep each sentence's trailing whitespace with it so dropping one leaves the spacing intact.
  const sentences = segment.match(/[^.!?]*(?:[.!?]+|$)\s*/g) ?? [segment];
  const out: string[] = [];
  for (const s of sentences) {
    if (!s.includes(MARK)) {
      out.push(s);
      continue;
    }
    const lead = /^\s*/.exec(s)?.[0] ?? "";
    const trail = /\s*$/.exec(s)?.[0] ?? "";
    const fixed = repairSentence(s.trim());
    if (fixed !== null) out.push(`${lead}${fixed}${trail}`);
    else if (out.length === 0) out.push(lead);
  }
  return out.join("").replace(/\s+$/, (ws) => (segment.endsWith(" ") ? " " : ws.includes("\n") ? "\n" : ""));
}

/** Resolves each mark in one sentence; null when what is left is not a sentence any more. */
export function repairSentence(sentence: string): string | null {
  const capitalised = /^\p{Lu}/u.test(sentence.replace(MARK, "").trimStart()) || /^\p{Lu}/u.test(sentence.split(MARK)[1]?.trimStart() ?? "");
  let text = sentence;
  for (let at = text.indexOf(MARK); at >= 0; at = text.indexOf(MARK)) {
    let left = text.slice(0, at).replace(/\s+$/, "");
    let right = text.slice(at + 1).replace(/^\s+/, "");
    // Half of a hyphenated compound survived: "and -friendly", "kid- ".
    if (/^-\p{L}/u.test(right) || /\p{L}-$/u.test(left)) return null;
    const rightIsEnd = right === "" || /^[.,;:!?)\]]/.test(right) || right.startsWith(MARK);
    if (rightIsEnd) {
      left = left.replace(TRAILING_CONJ_RE, "");
      if (endsDangling(left)) return null;
      if (/[(\[]$/.test(left) && /^[)\]]/.test(right)) {
        left = left.slice(0, -1).replace(/\s+$/, "");
        right = right.slice(1);
      }
      if (/[,;:]$/.test(left) && /^[.,;:!?]/.test(right)) left = left.slice(0, -1);
      if (/^[,;:]/.test(right) && (left === "" || /[,;:(]$/.test(left))) right = right.slice(1).replace(/^\s+/, "");
    } else {
      // "100% <organic> cotton" would become a new claim, "100% cotton": the number belonged to what was removed.
      if (/(?:\d|%|°)$/.test(left)) return null;
      // "made with <organic> and recycled cotton", "is <frost-proof> and sturdy": the conjunction joined the removed claim.
      if (left === "" || /[,;:(]$/.test(left) || TRAILING_CONJ_RE.test(left) || endsDangling(left)) right = right.replace(LEADING_CONJ_RE, "");
    }
    if (left === "" && /^[,;:]/.test(right)) right = right.slice(1).replace(/^\s+/, "");
    text = left === "" ? right : right === "" || /^[.,;:!?)\]]/.test(right) ? `${left}${right}` : `${left} ${right}`;
  }
  text = tidyFragment(text);
  if (capitalised) text = text.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  const words = foldForMatch(text).split(" ").filter((w) => /\p{L}/u.test(w));
  return words.length < 2 ? null : text;
}

function endsDangling(left: string): boolean {
  if (left === "") return false;
  if (/(?:\d|%|°|[€$£])$/.test(left)) return true;
  const last = /([\p{L}']+)$/u.exec(left)?.[1]?.toLowerCase();
  return last !== undefined && DANGLING.has(last);
}

function tidyFragment(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/([,;:])(?=[.,;:!?])/g, "")
    .replace(/^[\s,;:.]+/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

function removeEmptyElements(html: string): string {
  let out = html;
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/<(strong|em|b|i|u|a)\b[^>]*>\s*<\/\1>/gi, "")
      .replace(/<(p|li|h2|h3|h4)\b[^>]*>[\s.,;:!?]*<\/\1>/gi, "")
      .replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
