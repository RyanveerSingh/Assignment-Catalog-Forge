import { foldForMatch } from "@/core/clean/text";
import { PLACE_AFTER_RE } from "./lexicon";
import { BOUNDARY, tokenizeClauses } from "./negation";

/**
 * Origin claims (EC-D2): "Made in Portugal" in a listing is backed only by a source clause that says
 * the thing was produced there. A place named next to "designed", "developed" or "brand" is not an
 * origin: "Designed in Germany, made in China" supports "Made in China" and nothing else.
 */

export interface OriginClaim {
  /** The phrase as the listing wrote it: "Made in Portugal". */
  phrase: string;
  place: string;
}

/** Every "Made in <Place>" in the listing text, in order. */
export function findOriginClaims(listingText: string): OriginClaim[] {
  const re = new RegExp(PLACE_AFTER_RE.source, "gu");
  const out: OriginClaim[] = [];
  for (const m of listingText.matchAll(re)) {
    const place = m[1];
    if (place) out.push({ phrase: m[0], place });
  }
  return out;
}

/** English place names a listing uses → the names a German or French supplier writes (folded). */
const PLACE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  germany: ["deutschland", "allemagne"],
  austria: ["osterreich", "oesterreich", "autriche"],
  switzerland: ["schweiz", "suisse"],
  italy: ["italien", "italie", "italia"],
  spain: ["spanien", "espagne", "espana"],
  france: ["frankreich"],
  china: ["chine"],
  india: ["indien", "inde"],
  nepal: [],
  portugal: [],
  vietnam: ["viet nam"],
  netherlands: ["niederlande", "holland", "pays bas"],
  belgium: ["belgien", "belgique"],
  poland: ["polen", "pologne"],
  denmark: ["danemark"],
  sweden: ["schweden", "suede"],
  norway: ["norwegen", "norvege"],
  finland: ["finnland", "finlande"],
  turkey: ["turkei", "turquie", "turkiye"],
  morocco: ["marokko", "maroc"],
  greece: ["griechenland", "grece"],
  "czech republic": ["tschechien", "republique tcheque"],
  japan: ["japon"],
  indonesia: ["indonesien", "indonesie"],
  thailand: ["thailande"],
  mexico: ["mexiko", "mexique"],
  peru: ["perou"],
  england: ["angleterre"],
  scotland: ["schottland", "ecosse"],
  ireland: ["irland", "irlande"],
  europe: ["europa"],
};

/** Words that make a place an origin: made, manufactured, hand-felted ("feutrée à la main au Népal"). */
const PRODUCTION_WORDS: ReadonlySet<string> = new Set([
  "made", "manufactured", "produced", "crafted", "handcrafted", "handmade", "built", "woven", "handwoven", "knotted", "felted", "thrown", "carved", "blown", "sewn", "stitched", "forged", "cast", "poured", "printed", "fired", "hand",
  "hergestellt", "gefertigt", "handgefertigt", "produziert", "gemacht", "gewebt", "geknupft", "gefilzt", "gegossen", "geblasen", "gebaut", "handarbeit",
  "fabrique", "fabriquee", "fabriques", "fabriquees", "produit", "produite", "produits", "fait", "faite", "faits", "faites", "confectionne", "confectionnee", "tisse", "tissee", "noue", "feutre", "feutree", "souffle", "main",
]);
/** Words that tie a place to something other than production; a production word beyond them does not count. */
const NON_PRODUCTION_WORDS: ReadonlySet<string> = new Set([
  "designed", "design", "developed", "conceived", "engineered", "styled", "inspired", "brand", "company", "based", "headquartered", "founded", "sold", "shipped", "ships", "imported", "distributed",
  "entworfen", "entwickelt", "designt", "konzipiert", "marke", "firma", "vertrieben", "importiert", "inspiriert",
  "concu", "concue", "dessine", "dessinee", "marque", "importe", "importee", "distribue", "inspire",
]);
/** Origin fields: "Country of origin: Portugal", "Herkunftsland: Portugal", "Pays d'origine : Portugal". */
const ORIGIN_LABELS: ReadonlySet<string> = new Set(["origin", "herkunft", "herkunftsland", "ursprungsland", "produktionsland", "origine", "provenance"]);
const LOOKBACK = 6;

/** The folded names a source may use for a place: "germany", "deutschland", "allemagne". */
export function placeNames(place: string): string[] {
  const folded = foldForMatch(place);
  return [folded, ...(PLACE_ALIASES[folded] ?? [])].filter(Boolean);
}

function namesFor(place: string): string[][] {
  return placeNames(place).map((n) => n.split(" "));
}

function matchesAt(tokens: readonly string[], at: number, name: readonly string[]): boolean {
  return name.every((t, j) => tokens[at + j] === t);
}

/** Whether the clause before a place says it was produced there. */
function producedAt(tokens: readonly string[], at: number): boolean {
  for (let k = at - 1, steps = 0; k >= 0 && steps < LOOKBACK; k--, steps++) {
    const t = tokens[k];
    if (t === undefined || t === BOUNDARY) return false;
    if (NON_PRODUCTION_WORDS.has(t)) return false;
    if (PRODUCTION_WORDS.has(t)) return true;
  }
  return false;
}

/** An origin field names the place: "country of origin portugal" or a "Made in" column, once the colon is folded away. */
function labelledOrigin(folded: readonly string[], at: number): boolean {
  for (let k = at - 1; k >= 0 && k >= at - 3; k--) if (ORIGIN_LABELS.has(folded[k] ?? "")) return true;
  const prep = folded[at - 1];
  return (prep === "in" || prep === "en" || prep === "au") && PRODUCTION_WORDS.has(folded[at - 2] ?? "");
}

/** True when a source clause says the product was made in `place` (or an origin field names it). */
export function originSupported(place: string, sourceText: string): boolean {
  const names = namesFor(place);
  if (names.length === 0) return false;
  const tokens = tokenizeClauses(sourceText);
  const folded = foldForMatch(sourceText).split(" ").filter(Boolean);
  for (const name of names) {
    for (let i = 0; i + name.length <= tokens.length; i++) if (matchesAt(tokens, i, name) && producedAt(tokens, i)) return true;
    for (let i = 0; i + name.length <= folded.length; i++) if (matchesAt(folded, i, name) && labelledOrigin(folded, i)) return true;
  }
  return false;
}
