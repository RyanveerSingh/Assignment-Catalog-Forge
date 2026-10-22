/**
 * Colour normalisation (EC-B9): canonical English colour names from EN/DE/FR supplier values
 * with typos, modifiers ("dunkelblau", "bleu foncé", "pale blue") and multi-colour values.
 */
import { foldForMatch, isPlaceholder } from "./text";

export type ColorMatchMethod = "exact" | "synonym" | "fuzzy" | "none";

export interface NormalizedColor {
  raw: string;
  primary: string | null;
  all: string[];
  method: ColorMatchMethod;
  confidence: number;
}

export const COLOR_VOCABULARY: ReadonlyArray<string> = Object.freeze([
  "black", "white", "grey", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown",
  "beige", "cream", "ivory", "navy", "teal", "turquoise", "olive", "gold", "silver", "bronze",
  "copper", "terracotta", "charcoal", "anthracite", "taupe", "sand", "natural", "clear",
  "multicolour", "burgundy", "maroon", "mint", "lilac", "lavender", "coral", "peach", "mustard",
  "khaki", "rust", "ochre", "magenta", "cyan", "indigo", "violet", "amber", "chocolate", "walnut",
  "oak", "pine", "mahogany", "graphite", "slate", "stone", "ecru", "off-white", "rose gold",
  "light blue", "dark blue", "light grey", "dark grey", "light green", "dark green", "light brown",
  "dark brown", "light pink", "dark red", "bright red", "sky blue", "royal blue", "forest green",
  "lime", "emerald", "sage",
]);

/** canonical → EN/DE/FR spellings. "violet" is a vocabulary entry, so it is not mapped to purple. */
const SYNONYM_GROUPS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ["white", ["weiss", "weiß", "blanc", "blanche"]],
  ["black", ["schwarz", "noir", "noire"]],
  ["red", ["rot", "rouge"]],
  ["blue", ["blau", "bleu", "bleue"]],
  ["green", ["grün", "gruen", "vert", "verte"]],
  ["yellow", ["gelb", "jaune"]],
  ["grey", ["gray", "grau", "gris", "grise"]],
  ["brown", ["braun", "marron", "brun", "brune"]],
  ["pink", ["rosa", "rose"]],
  ["purple", ["lila", "violett", "violette"]],
  ["turquoise", ["türkis", "tuerkis"]],
  ["cream", ["creme", "crème", "cremefarben", "cremeweiß"]],
  ["natural", ["natur", "naturel", "naturelle", "naturfarben", "holz", "bois"]],
  ["silver", ["silber", "argent", "argenté"]],
  ["gold", ["or", "doré", "dorée", "golden"]],
  ["ivory", ["elfenbein", "ivoire"]],
  ["olive", ["oliv"]],
  ["burgundy", ["bordeaux", "weinrot"]],
  ["khaki", ["kaki"]],
  ["clear", ["transparent", "klar"]],
  ["multicolour", ["bunt", "mehrfarbig", "multicolor", "multi-coloured", "multi-colored", "multicolored", "multicolore"]],
  ["dark blue", ["dunkelblau", "bleu foncé"]],
  ["navy", ["bleu marine", "navy blue", "marine", "marineblau"]],
  ["light blue", ["hellblau", "bleu clair"]],
  ["dark green", ["dunkelgrün", "vert foncé"]],
  ["light green", ["hellgrün", "vert clair"]],
  ["dark grey", ["dunkelgrau", "gris foncé", "dark gray"]],
  ["light grey", ["hellgrau", "gris clair", "light gray"]],
  ["dark brown", ["dunkelbraun", "brun foncé"]],
  ["light brown", ["hellbraun", "brun clair"]],
  ["dark red", ["dunkelrot", "rouge foncé"]],
  ["light pink", ["hellrosa", "rose clair"]],
  ["rose gold", ["rosé gold", "roségold", "rosegold", "or rose"]],
  ["off-white", ["off white", "offwhite", "altweiß", "blanc cassé"]],
  ["mustard", ["senf", "senfgelb", "moutarde"]],
  ["mint", ["minze", "mintgrün", "menthe"]],
  ["coral", ["koralle", "corail"]],
  ["peach", ["pfirsich", "pêche"]],
  ["sand", ["sable"]],
  ["stone", ["stein", "pierre"]],
  ["slate", ["schiefer", "ardoise"]],
  ["anthracite", ["anthrazit"]],
  ["terracotta", ["terra cotta", "terra-cotta", "terrakotta", "terre cuite"]],
  ["copper", ["kupfer", "cuivre"]],
  ["graphite", ["graphit"]],
  ["charcoal", ["holzkohle", "charbon"]],
  ["lavender", ["lavendel", "lavande"]],
  ["lilac", ["flieder"]],
  ["ochre", ["ocker", "ocre"]],
  ["amber", ["bernstein", "ambre"]],
  ["chocolate", ["schokolade", "schokoladenbraun", "chocolat"]],
  ["walnut", ["nussbaum", "noyer"]],
  ["oak", ["eiche", "chêne"]],
  ["pine", ["kiefer"]],
  ["mahogany", ["mahagoni", "acajou"]],
  ["emerald", ["smaragd", "smaragdgrün", "émeraude"]],
  ["sage", ["salbei", "sauge"]],
  ["lime", ["limette", "limettengrün", "citron vert"]],
  ["sky blue", ["himmelblau", "bleu ciel"]],
  ["royal blue", ["königsblau", "koenigsblau", "bleu roi"]],
  ["forest green", ["waldgrün", "vert forêt"]],
  ["maroon", ["kastanienbraun"]],
  ["rust", ["rost", "rouille"]],
  ["ecru", ["écru"]],
  ["bright red", ["knallrot", "rouge vif"]],
];

type Modifier = "dark" | "light" | "bright";
const MODIFIERS: Readonly<Record<string, Modifier>> = {
  dark: "dark", dunkel: "dark", fonce: "dark", foncee: "dark", deep: "dark", tief: "dark",
  light: "light", hell: "light", clair: "light", claire: "light", pale: "light", blass: "light",
  bright: "bright", leuchtend: "bright", vif: "bright", vive: "bright",
};
/** German glues the modifier onto the colour: "hellrot", "dunkelgelb". */
const GLUED_PREFIXES: ReadonlyArray<readonly [string, Modifier]> = [["dunkel", "dark"], ["hell", "light"]];

/** Single tokens that are colours only as a cell value, never in free text ("red or blue"). */
const TEXT_IGNORED: ReadonlySet<string> = new Set(["or"]);

const CONFIDENCE: Readonly<Record<ColorMatchMethod, number>> = { exact: 100, synonym: 95, fuzzy: 75, none: 0 };
const RANK: Readonly<Record<ColorMatchMethod, number>> = { exact: 3, synonym: 2, fuzzy: 1, none: 0 };

const STRONG_SEPARATOR = /\s*(?:[/&,+|;]|\band\b|\bund\b|\bet\b)\s*/i;

const VOCABULARY_SET: ReadonlySet<string> = new Set(COLOR_VOCABULARY);
const EXACT = new Map<string, string>(COLOR_VOCABULARY.map((c) => [foldForMatch(c), c]));
const SYNONYMS = new Map<string, string>();
for (const [canonical, keys] of SYNONYM_GROUPS) {
  for (const key of keys) SYNONYMS.set(foldForMatch(key), canonical);
}
/** Vocabulary first so ties in fuzzy matching prefer canonical names. Order is deterministic. */
const FUZZY_CANDIDATES: ReadonlyArray<readonly [string, string]> = [...EXACT.entries(), ...SYNONYMS.entries()];

interface Hit {
  color: string;
  method: Exclude<ColorMatchMethod, "none">;
}

type FuzzyMode = "value" | "text";

export function normalizeColor(raw: string | null | undefined): NormalizedColor {
  const rawText = raw === null || raw === undefined ? "" : String(raw);
  const none: NormalizedColor = { raw: rawText, primary: null, all: [], method: "none", confidence: 0 };
  if (isPlaceholder(rawText)) return none;
  const hits = resolveValue(rawText);
  if (hits.length === 0) return none;
  const all = dedupe(hits.map((h) => h.color));
  const weakest = hits.reduce((w, h) => (RANK[h.method] < RANK[w.method] ? h : w));
  return { raw: rawText, primary: all[0], all, method: weakest.method, confidence: CONFIDENCE[weakest.method] };
}

/** Canonical colours mentioned in free text, in order of appearance, de-duplicated. */
export function extractColorTokens(text: string): string[] {
  if (typeof text !== "string" || text === "") return [];
  const words = foldForMatch(text).split(" ").filter((w) => w !== "");
  const found: string[] = [];
  let i = 0;
  while (i < words.length) {
    let hit: Hit | null = null;
    let span = 1;
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const slice = words.slice(i, i + len);
      hit = len === 1 ? resolveTextWord(slice[0]) : (lookupDirect(slice.join(" ")) ?? lookupCompound(slice));
      if (hit) {
        span = len;
        break;
      }
    }
    if (hit) found.push(hit.color);
    i += span;
  }
  return dedupe(found);
}

function resolveValue(raw: string): Hit[] {
  const whole = resolvePhrase(foldForMatch(raw), "value");
  if (whole) return [whole];
  const hits: Hit[] = [];
  for (const part of raw.split(STRONG_SEPARATOR)) {
    const folded = foldForMatch(part);
    if (folded === "") continue;
    const hit = resolvePhrase(folded, "value");
    if (hit) {
      hits.push(hit);
      continue;
    }
    // "rot-blau", "blau glänzend": fall back to the individual words.
    for (const word of folded.split(" ")) {
      const wordHit = resolvePhrase(word, "value");
      if (wordHit) hits.push(wordHit);
    }
  }
  return hits;
}

function resolvePhrase(folded: string, mode: FuzzyMode): Hit | null {
  if (folded === "") return null;
  return lookupDirect(folded) ?? lookupCompound(folded.split(" ")) ?? lookupFuzzy(folded, mode);
}

function resolveTextWord(word: string): Hit | null {
  if (TEXT_IGNORED.has(word)) return null;
  return resolvePhrase(word, "text");
}

function lookupDirect(folded: string): Hit | null {
  const exact = EXACT.get(folded);
  if (exact !== undefined) return { color: exact, method: "exact" };
  const synonym = SYNONYMS.get(folded);
  if (synonym !== undefined) return { color: synonym, method: "synonym" };
  return null;
}

/** "pale blue" → light blue, "bleu foncé" → dark blue, "hellrot" → red (no "light red" in the vocabulary). */
function lookupCompound(tokens: string[]): Hit | null {
  if (tokens.length >= 2) {
    const first = MODIFIERS[tokens[0]];
    const last = MODIFIERS[tokens[tokens.length - 1]];
    if (first !== undefined) {
      const base = lookupDirect(tokens.slice(1).join(" "));
      if (base) return compound(first, base);
    }
    if (last !== undefined) {
      const base = lookupDirect(tokens.slice(0, -1).join(" "));
      if (base) return compound(last, base);
    }
    return null;
  }
  const word = tokens[0] ?? "";
  for (const [prefix, modifier] of GLUED_PREFIXES) {
    if (word.length > prefix.length + 2 && word.startsWith(prefix)) {
      const base = lookupDirect(word.slice(prefix.length));
      if (base) return compound(modifier, base);
    }
  }
  return null;
}

function compound(modifier: Modifier, base: Hit): Hit {
  const name = `${modifier} ${base.color}`;
  return { color: VOCABULARY_SET.has(name) ? name : base.color, method: "synonym" };
}

function maxEdits(length: number, mode: FuzzyMode): number {
  if (mode === "text") return length >= 7 ? 1 : 0;
  if (length >= 7) return 2;
  return length >= 4 ? 1 : 0;
}

function lookupFuzzy(folded: string, mode: FuzzyMode): Hit | null {
  const limit = maxEdits(folded.length, mode);
  if (limit === 0) return null;
  let best: string | null = null;
  let bestDistance = limit + 1;
  for (const [key, canonical] of FUZZY_CANDIDATES) {
    const distance = osaDistance(folded, key, limit);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = canonical;
      if (distance === 1) break;
    }
  }
  return best === null ? null : { color: best, method: "fuzzy" };
}

/** Damerau–Levenshtein (optimal string alignment) with early exit above `limit`. */
function osaDistance(a: string, b: string, limit: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > limit) return limit + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

function dedupe(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}
