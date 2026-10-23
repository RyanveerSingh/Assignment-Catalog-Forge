/**
 * Finds a quote inside a source cell the way the grounding validator matches text: case-, accent- and
 * punctuation-insensitive, so "not frost proof" is found in "(not frost-proof, bring indoors)". The span
 * is returned in the original string so the review drawer can mark the exact characters.
 * Self-contained on purpose: the client bundle imports it, so it must not pull in the encoding tables.
 */

export interface TextSpan {
  start: number;
  end: number;
}

const FOLD_MAP: Readonly<Record<string, string>> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l" };
const ALNUM = /[\p{L}\p{N}]/u;

interface Folded {
  text: string;
  /** Original index of the character that produced each folded character. */
  map: number[];
}

function foldChar(ch: string): string {
  return ch
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ßæœøđł]/g, (c) => FOLD_MAP[c] ?? c);
}

function charLength(text: string, at: number): number {
  const cp = text.codePointAt(at) ?? 0;
  return cp > 0xffff ? 2 : 1;
}

/** Same folding as `foldForMatch`, character by character, remembering where every folded character came from. */
function foldWithMap(text: string): Folded {
  let out = "";
  const map: number[] = [];
  // Original index of the first separator in the current run; a run becomes one space, or nothing at the edges.
  let separatorAt = -1;
  for (let i = 0; i < text.length; ) {
    const len = charLength(text, i);
    for (const f of foldChar(text.slice(i, i + len))) {
      if (ALNUM.test(f)) {
        if (separatorAt >= 0 && out.length > 0) {
          out += " ";
          map.push(separatorAt);
        }
        separatorAt = -1;
        out += f;
        map.push(i);
      } else if (separatorAt < 0) {
        separatorAt = i;
      }
    }
    i += len;
  }
  return { text: out, map };
}

/** The comparison form of a string; identical to `foldForMatch` for the inputs that matter here. */
export function foldQuote(text: string): string {
  return typeof text === "string" ? foldWithMap(text).text : "";
}

/** Where `quote` sits in `cell`, or null when the cell does not contain it. Never throws. */
export function locateQuote(cell: string, quote: string): TextSpan | null {
  if (typeof cell !== "string" || typeof quote !== "string") return null;
  const hay = foldWithMap(cell);
  const needle = foldWithMap(quote).text;
  if (needle === "" || hay.text === "") return null;
  // Whole words first; a bare substring second, so "frost proof" still lands inside "frostproof".
  const padded = ` ${hay.text} `.indexOf(` ${needle} `);
  const at = padded >= 0 ? padded : hay.text.indexOf(needle);
  if (at < 0) return null;
  const start = hay.map[at];
  const last = hay.map[at + needle.length - 1];
  if (start === undefined || last === undefined) return null;
  return { start, end: last + charLength(cell, last) };
}
