import type { PublishedVariant } from "@/db/schema";

/**
 * Maps the colour names suppliers actually write ("dark blue", "salbeigrün", "ocre") to a CSS
 * colour for the small swatch on a product card. The swatch is a hint next to the written name,
 * never the only signal, so a near-enough tone is fine and an unknown name gets a neutral ring.
 */

const OPTION_KEYS = new Set(["color", "colour", "colors", "colours", "farbe", "couleur"]);
const MAX_SWATCHES = 5;

/** Keys are normalised: lower case, accents stripped, ß → ss, one space between words. */
const COLOURS: Record<string, string> = {
  white: "#ffffff", weiss: "#ffffff", blanc: "#ffffff", blanche: "#ffffff",
  black: "#1a1714", schwarz: "#1a1714", noir: "#1a1714", noire: "#1a1714",
  grey: "#8a8580", gray: "#8a8580", grau: "#8a8580", gris: "#8a8580", grise: "#8a8580",
  "dark grey": "#4a4744", "dark gray": "#4a4744", dunkelgrau: "#4a4744", "gris fonce": "#4a4744", anthracite: "#4a4744", anthrazit: "#4a4744", charcoal: "#4a4744",
  "light grey": "#c9c4bd", "light gray": "#c9c4bd", hellgrau: "#c9c4bd", "gris clair": "#c9c4bd",
  blue: "#3f5f8a", blau: "#3f5f8a", bleu: "#3f5f8a", bleue: "#3f5f8a",
  "dark blue": "#2b3f66", dunkelblau: "#2b3f66", "bleu fonce": "#2b3f66", navy: "#2b3f66", marine: "#2b3f66", indigo: "#2b3f66",
  "light blue": "#9db7d6", hellblau: "#9db7d6", "bleu clair": "#9db7d6", sky: "#9db7d6",
  petrol: "#2f5f6a", teal: "#2f6f6a", turquoise: "#4fa3a0", tuerkis: "#4fa3a0",
  green: "#3b6d11", gruen: "#3b6d11", vert: "#3b6d11", verte: "#3b6d11",
  "dark green": "#2f4a2a", dunkelgruen: "#2f4a2a", "vert fonce": "#2f4a2a", forest: "#2f4a2a",
  sage: "#9aa88a", "sage green": "#9aa88a", salbei: "#9aa88a", salbeigruen: "#9aa88a", "vert sauge": "#9aa88a", sauge: "#9aa88a",
  olive: "#6f6b2e", oliv: "#6f6b2e", khaki: "#8b8259",
  mint: "#a8d5c2", menthe: "#a8d5c2", minze: "#a8d5c2",
  red: "#b42318", rot: "#b42318", rouge: "#b42318",
  burgundy: "#6b1e2b", bordeaux: "#6b1e2b", weinrot: "#6b1e2b", wine: "#6b1e2b",
  pink: "#e3a6b5", rosa: "#e3a6b5", rose: "#e3a6b5", blush: "#e8c0c0",
  orange: "#e07b24",
  yellow: "#e8c547", gelb: "#e8c547", jaune: "#e8c547",
  mustard: "#c9a227", senf: "#c9a227", senfgelb: "#c9a227", moutarde: "#c9a227",
  ochre: "#c68a3a", ocher: "#c68a3a", ocker: "#c68a3a", ocre: "#c68a3a",
  brown: "#6b4a2b", braun: "#6b4a2b", brun: "#6b4a2b", brune: "#6b4a2b", marron: "#6b4a2b",
  beige: "#d9c8ad", cream: "#f1e9d8", creme: "#f1e9d8", ivory: "#f1e9d8", elfenbein: "#f1e9d8", ivoire: "#f1e9d8",
  sand: "#d8c3a0", sable: "#d8c3a0", taupe: "#8b7d6b", stone: "#b8b0a3", stein: "#b8b0a3", pierre: "#b8b0a3",
  terracotta: "#b65a3a", terrakotta: "#b65a3a", "terre cuite": "#b65a3a",
  rust: "#a3471f", rost: "#a3471f", rouille: "#a3471f",
  amber: "#b45309", bernstein: "#b45309", ambre: "#b45309",
  gold: "#c7a24a", or: "#c7a24a", silver: "#b9b9b6", silber: "#b9b9b6", argent: "#b9b9b6",
  copper: "#b87333", kupfer: "#b87333", cuivre: "#b87333", brass: "#b5a642", messing: "#b5a642", laiton: "#b5a642",
  natural: "#d8c9b0", natur: "#d8c9b0", naturel: "#d8c9b0", naturelle: "#d8c9b0",
  oak: "#c4a173", eiche: "#c4a173", chene: "#c4a173", walnut: "#5d3f2a", nussbaum: "#5d3f2a", noyer: "#5d3f2a", teak: "#a0714a",
  purple: "#6d4c8a", lila: "#6d4c8a", violett: "#6d4c8a", violet: "#6d4c8a", lavender: "#b8a9d1", lavendel: "#b8a9d1", lavande: "#b8a9d1",
};

export function normaliseColourName(name: string): string {
  // German umlauts become their two-letter spellings before NFD would reduce them to the bare vowel.
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ü/g, "ue")
    .replace(/ö/g, "oe")
    .replace(/ä/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** The CSS colour for a supplier's colour name, or null when nothing in the table fits. */
export function swatchColour(name: string): string | null {
  const key = normaliseColourName(name);
  if (!key) return null;
  const exact = COLOURS[key];
  if (exact) return exact;
  // "petrol blue" or "bleu canard": the last word usually carries the hue in English and German, the first in French.
  const words = key.split(" ");
  if (words.length > 1) {
    const last = COLOURS[words[words.length - 1] ?? ""];
    if (last) return last;
    const first = COLOURS[words[0] ?? ""];
    if (first) return first;
  }
  return null;
}

export interface ColourSwatch {
  name: string;
  css: string | null;
}

/** Distinct colour values across the published variants, in sheet order, capped so a card never grows a second row of dots. */
export function colourSwatches(variants: PublishedVariant[], max = MAX_SWATCHES): { swatches: ColourSwatch[]; more: number } {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const v of variants)
    for (const [option, value] of Object.entries(v.options)) {
      if (!OPTION_KEYS.has(option.trim().toLowerCase())) continue;
      const trimmed = value.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      names.push(trimmed);
    }
  if (names.length < 2) return { swatches: [], more: 0 };
  return { swatches: names.slice(0, max).map((name) => ({ name, css: swatchColour(name) })), more: Math.max(0, names.length - max) };
}
