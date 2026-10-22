/**
 * Per-row language detection (EC-B10) for EN/DE/FR. Stopwords decide short titles; franc's
 * trigram model is consulted only for longer text when the stopwords are inconclusive.
 * Deterministic and never throws.
 */
import { francAll } from "franc";
import type { DetectedLanguage, Lang } from "../types";

type Known = Exclude<Lang, "und">;

const KNOWN: ReadonlyArray<Known> = ["de", "fr", "en"];

const STOPWORDS: Readonly<Record<Known, ReadonlySet<string>>> = {
  de: new Set(["und", "mit", "für", "der", "die", "das", "aus", "ist", "nicht", "oder", "von", "zum", "zur", "bei", "ein", "eine", "einen", "sehr", "ohne"]),
  fr: new Set(["et", "avec", "pour", "le", "la", "les", "des", "une", "un", "en", "du", "est", "pas", "sur", "dans", "sans", "très", "aux", "ce", "cette"]),
  en: new Set(["and", "with", "for", "the", "of", "is", "not", "or", "in", "on", "from", "by", "to", "this", "that", "without", "very"]),
};

/** Accented letters are only a tie-breaker between equal stopword counts. */
const ACCENTS: Readonly<Record<Known, RegExp | null>> = { de: /[ßäöü]/g, fr: /[éèêçàù]/g, en: null };

const FRANC_TO_LANG: Readonly<Record<string, Known>> = { eng: "en", deu: "de", fra: "fr" };
const FRANC_ONLY = ["eng", "deu", "fra"];

const MIN_WORDS = 3;
const FRANC_MIN_CHARS = 40;
/** franc normalises the top score to 1; this is the runner-up gap below which it is a coin toss. */
const FRANC_TIE_GAP = 0.02;

const UNDETERMINED: DetectedLanguage = { lang: "und", confidence: 0 };

export function detectLanguage(text: string | null | undefined): DetectedLanguage {
  if (typeof text !== "string") return { ...UNDETERMINED };
  const normalized = text.normalize("NFC").trim();
  if (normalized === "" || normalized.split(/\s+/).length < MIN_WORDS) return { ...UNDETERMINED };

  const lower = normalized.toLowerCase();
  const words = lower.match(/\p{L}+/gu) ?? [];
  const hits: Record<Known, number> = { de: 0, fr: 0, en: 0 };
  for (const word of words) {
    for (const lang of KNOWN) if (STOPWORDS[lang].has(word)) hits[lang]++;
  }

  const sole = KNOWN.find((lang) => hits[lang] >= 2 && KNOWN.every((other) => other === lang || hits[other] === 0));
  if (sole) return { lang: sole, confidence: Math.min(90, 70 + 10 * (hits[sole] - 2)) };

  const leader = stopwordLeader(hits, lower);
  if (normalized.length >= FRANC_MIN_CHARS) {
    const guess = detectWithFranc(normalized);
    if (guess) {
      const confidence = leader === guess.lang ? Math.min(90, guess.confidence + 10) : guess.confidence;
      return { lang: guess.lang, confidence };
    }
  }
  if (leader) return { lang: leader, confidence: Math.min(60, 40 + 10 * (hits[leader] - 1)) };
  return { ...UNDETERMINED };
}

/** The language strictly ahead on stopword hits (accents break ties); null when nothing leads. */
function stopwordLeader(hits: Record<Known, number>, lower: string): Known | null {
  const ranked = KNOWN.map((lang) => {
    const accentRe = ACCENTS[lang];
    const accents = accentRe ? (lower.match(accentRe) ?? []).length : 0;
    return { lang, hits: hits[lang], accents };
  }).sort((a, b) => b.hits - a.hits || b.accents - a.accents);
  const [first, second] = ranked;
  if (!first || !second || first.hits === 0) return null;
  const ahead = first.hits > second.hits || (first.hits === second.hits && first.accents > second.accents);
  return ahead ? first.lang : null;
}

function detectWithFranc(text: string): DetectedLanguage & { lang: Known } | null {
  let results: Array<[string, number]>;
  try {
    results = francAll(text, { only: [...FRANC_ONLY], minLength: 10 });
  } catch {
    return null;
  }
  const top = results[0];
  if (!top) return null;
  const lang = FRANC_TO_LANG[top[0]];
  if (!lang) return null;
  // Scores are normalised so the best language is 1 and worse ones are lower; a small gap means
  // the trigram profiles could not tell the candidates apart.
  const runnerUp = results[1]?.[1] ?? 0;
  const gap = top[1] - runnerUp;
  if (!Number.isFinite(gap) || gap < FRANC_TIE_GAP) return null;
  return { lang, confidence: Math.max(10, Math.min(85, Math.round(gap * 200))) };
}
