/**
 * Marketing and regulatory claims that must be grounded in the supplier's text (EC-D2).
 * Each entry: the canonical English term plus spellings and DE/FR equivalents that count as the
 * same claim appearing in the source. Comparison happens on `foldForMatch` output (lower-case,
 * accents stripped, punctuation → space), so entries are written that way.
 */

export interface ClaimTerm {
  term: string;
  variants: string[];
  /**
   * Marketing adjectives rather than facts, certifications or safety statements. When unsupported they
   * are still removed from the listing, but removing "premium" does not need a reviewer's time.
   */
  soft?: true;
  /** The phrase is only a claim when a place name follows ("Made in Portugal"), never in "hand-made in natural jute". */
  placeAfter?: true;
  /**
   * Phrases that count as evidence the term holds ("solid oak" for solid wood) without being the
   * term itself: they can support a claim but never cancel an explicit negation of the term.
   */
  supports?: string[];
  /**
   * Paraphrases that make the same promise in other words ("weatherproof", "can stay outside all
   * winter" for frost-proof). They count as the claim in the listing and as evidence in the source,
   * and a source that denies the term denies them too.
   */
  synonyms?: string[];
  /**
   * The use a "-safe" claim promises ("dishwasher" for dishwasher-safe), so "Not suitable for
   * dishwasher or microwave" denies the claim without spelling it.
   */
  uses?: string[];
}

/** Every spelling that states the claim itself: variants plus paraphrases. These decide negation. */
export function spellingsOf(entry: ClaimTerm): string[] {
  return entry.synonyms ? [...entry.variants, ...entry.synonyms] : entry.variants;
}

/** Every phrase that proves a term is present in the source: its own spellings plus its supporting evidence. */
export function evidenceFor(entry: ClaimTerm): string[] {
  const spellings = spellingsOf(entry);
  return entry.supports ? [...spellings, ...entry.supports] : spellings;
}

/** Origin phrases followed by a capitalised word: the shape of a real "Made in <Place>" statement. The place is captured. */
export const PLACE_AFTER_RE = /\b(?:[Mm]ade in|[Hh]ergestellt in|[Ff]abriqu[ée]e? (?:en|au|aux|à|a)|[Pp]roduite? (?:en|au|aux))\s+(\p{Lu}\p{L}+)/u;

export const CLAIM_LEXICON: ReadonlyArray<ClaimTerm> = [
  // Bare "bio" and "öko" are not evidence: "bio-based plastic" is not organic and "Öko-Tex" is a textile test.
  { term: "organic", variants: ["organic", "biologisch", "biologische", "biologischem", "biologique", "biologiques", "bio zertifiziert", "bio baumwolle", "bio qualitat", "kba", "oko baumwolle", "coton bio", "agriculture biologique", "certified organic"] },
  {
    term: "handmade",
    variants: ["handmade", "hand made", "made by hand", "handgefertigt", "handgefertigte", "handgemacht", "handgemachte", "fait main", "faite main", "fait a la main", "faite a la main", "artisanal", "artisanale", "handcrafted", "hand crafted"],
    // A named hand process is evidence of handmade: a hand-poured candle, a hand-woven rug.
    supports: [
      "hand poured", "hand woven", "hand knotted", "hand thrown", "hand carved", "hand stitched", "hand sewn", "hand blown", "hand dipped", "hand turned", "hand forged", "hand cast", "wheel thrown", "thrown by hand",
      "handgegossen", "handgegossene", "handgewebt", "handgeknupft", "handgedreht", "handgeschnitzt", "handgenaht", "mundgeblasen", "handgeschmiedet",
      "von hand gefertigt", "von hand gemacht", "von hand geflochten", "von hand genaht", "von hand gegossen", "von hand bemalt", "in handarbeit",
      "coulee a la main", "tisse a la main", "noue a la main", "tourne a la main", "sculpte a la main", "cousu a la main", "souffle a la bouche", "forge a la main",
    ],
  },
  { term: "hand-thrown", variants: ["hand thrown", "handthrown", "thrown by hand", "wheel thrown", "handgedreht", "handgedrehte", "handgedrehtem", "handgedrehten", "handgedrehter", "tourne a la main", "tournee a la main"] },
  { term: "hand-painted", variants: ["hand painted", "handpainted", "painted by hand", "handbemalt", "peint a la main"] },
  { term: "frost-proof", variants: ["frost proof", "frostproof", "frostsicher", "resistant au gel garanti", "frostfest"], synonyms: ["weatherproof", "weather proof", "weatherproofed", "winter hardy", "winterhardy", "winterfest", "winterhart", "wetterfest", "year round outdoor", "year round outdoors", "outdoors all year", "outside all year", "outside all winter", "outdoors all winter", "resistant aux intemperies", "ingelif", "ingelive"] },
  { term: "frost-resistant", variants: ["frost resistant", "frostresistant", "frostbestandig", "resistant au gel", "frost hardy"] },
  { term: "waterproof", variants: ["waterproof", "water proof", "wasserdicht", "etanche", "impermeable"], synonyms: ["watertight", "water tight"] },
  { term: "water-resistant", variants: ["water resistant", "waterresistant", "wasserabweisend", "wasserfest", "resistant a l eau", "hydrofuge"] },
  { term: "dishwasher-safe", variants: ["dishwasher safe", "dishwashersafe", "dishwasher proof", "dishwasher friendly", "spulmaschinenfest", "spulmaschinengeeignet", "spulmaschinen geeignet", "fur die spulmaschine geeignet", "lavable au lave vaisselle", "passe au lave vaisselle", "compatible lave vaisselle", "compatibles lave vaisselle", "va au lave vaisselle"], synonyms: ["dishwasher compatible", "dishwasher suitable", "geschirrspulerfest", "geschirrspulergeeignet", "spulmaschinentauglich", "lave vaisselle"], uses: ["dishwasher", "dishwashers", "spulmaschine", "geschirrspuler", "lave vaisselle"] },
  { term: "microwave-safe", variants: ["microwave safe", "microwavesafe", "mikrowellengeeignet", "mikrowellenfest", "passe au micro ondes", "compatible micro ondes"], synonyms: ["microwave proof", "microwave friendly"], uses: ["microwave", "microwaves", "mikrowelle", "micro ondes"] },
  { term: "oven-safe", variants: ["oven safe", "ovensafe", "ofenfest", "backofenfest", "passe au four"], synonyms: ["ovenproof", "oven proof"], uses: ["oven", "ovens", "backofen", "ofen", "four"] },
  { term: "freezer-safe", variants: ["freezer safe", "gefrierfest", "gefriergeeignet", "passe au congelateur"], synonyms: ["freezer proof", "freezer friendly"], uses: ["freezer", "freezers", "gefrierschrank", "congelateur"] },
  { term: "food-safe", variants: ["food safe", "foodsafe", "lebensmittelecht", "lebensmittelsicher", "contact alimentaire", "alimentaire"], synonyms: ["food grade", "food contact safe", "safe for food"] },
  { term: "bpa-free", variants: ["bpa free", "bpafree", "bpa frei", "ohne bpa", "sans bpa"] },
  { term: "lead-free", variants: ["lead free", "bleifrei", "sans plomb"] },
  { term: "non-toxic", variants: ["non toxic", "nontoxic", "ungiftig", "schadstofffrei", "non toxique", "atoxique"], synonyms: ["toxin free", "chemical free"] },
  { term: "vegan", variants: ["vegan", "vegane", "veganes", "vegetalien"] },
  { term: "recycled", variants: ["recycled", "recycelt", "recyclingmaterial", "recycle", "recyclee"] },
  { term: "recyclable", variants: ["recyclable", "recycelbar", "wiederverwertbar"] },
  { term: "sustainable", variants: ["sustainable", "sustainably", "nachhaltig", "ecoresponsable"] },
  { term: "eco-friendly", variants: ["eco friendly", "ecofriendly", "umweltfreundlich", "ecologique", "ecolo"] },
  { term: "biodegradable", variants: ["biodegradable", "biologisch abbaubar", "kompostierbar", "compostable"] },
  { term: "certified", variants: ["certified", "zertifiziert", "certifie", "certifiee"] },
  { term: "fsc", variants: ["fsc", "fsc certified", "fsc zertifiziert"] },
  { term: "gots", variants: ["gots", "gots certified"] },
  { term: "oeko-tex", variants: ["oeko tex", "oekotex", "okotex"] },
  { term: "fair trade", variants: ["fair trade", "fairtrade", "fair gehandelt", "commerce equitable"] },
  { term: "hypoallergenic", variants: ["hypoallergenic", "hypoallergen", "hypoallergenique"] },
  { term: "antibacterial", variants: ["antibacterial", "anti bacterial", "antibakteriell", "antibacterien"] },
  { term: "uv-resistant", variants: ["uv resistant", "uvresistant", "uv bestandig", "uv stabil", "resistant aux uv", "anti uv"], synonyms: ["uv stable", "uv stabilised", "uv stabilized", "uv proof", "uv protected", "fade resistant", "fade proof", "lichtecht"] },
  { term: "rustproof", variants: ["rustproof", "rust proof", "rostfrei", "inoxydable", "antirouille"] },
  { term: "rust-resistant", variants: ["rust resistant", "rustresistant", "rostbestandig", "rostgeschutzt", "resistant a la rouille"] },
  { term: "stainless steel", variants: ["stainless steel", "stainless", "edelstahl", "acier inoxydable", "inox"] },
  { term: "scratch-resistant", variants: ["scratch resistant", "kratzfest", "resistant aux rayures"], synonyms: ["scratch proof", "scratchproof", "scratch free", "kratzbestandig", "anti rayures", "inrayable"] },
  { term: "shatterproof", variants: ["shatterproof", "shatter proof", "bruchsicher", "incassable"] },
  { term: "heat-resistant", variants: ["heat resistant", "heatproof", "hitzebestandig", "hitzefest", "resistant a la chaleur"] },
  { term: "fireproof", variants: ["fireproof", "fire proof", "flameproof", "flame proof", "nicht brennbar", "unbrennbar", "incombustible"] },
  { term: "fire-retardant", variants: ["fire retardant", "flame retardant", "flammhemmend", "schwer entflammbar", "ignifuge"] },
  { term: "machine-washable", variants: ["machine washable", "maschinenwaschbar", "waschmaschinenfest", "lavable en machine"] },
  { term: "pet-safe", variants: ["pet safe", "haustierfreundlich", "sans danger pour les animaux"], synonyms: ["safe for pets", "pet friendly"], uses: ["pets", "animals", "haustiere"] },
  { term: "child-safe", variants: ["child safe", "kindersicher", "sans danger pour les enfants"], synonyms: ["safe for kids", "safe for children", "kid safe", "kids safe", "child friendly", "kid friendly", "baby safe", "safe for babies", "kinderfreundlich", "fur kinder geeignet", "adapte aux enfants"], uses: ["children", "kids", "babies", "kinder", "enfants"] },
  { term: "lifetime warranty", variants: ["lifetime warranty", "lifetime guarantee", "lebenslange garantie", "garantie a vie"] },
  { term: "100% cotton", variants: ["100 cotton", "100 baumwolle", "100 coton", "reine baumwolle", "pure cotton"] },
  { term: "100% wool", variants: ["100 wool", "100 wolle", "100 laine", "pure wool", "reine wolle"] },
  { term: "100% linen", variants: ["100 linen", "100 leinen", "100 lin", "pure linen"] },
  {
    term: "solid wood",
    variants: ["solid wood", "solid timber", "massivholz", "massivem holz", "massives holz", "bois massif"],
    // A named species backs the claim ("solid oak" is solid wood) but never outvotes an explicit
    // "not solid wood": a veneer top with solid ash legs is still not solid wood.
    supports: [
      "solid oak", "solid beech", "solid ash", "solid pine", "solid walnut", "solid teak", "solid maple", "solid birch", "solid acacia", "solid mango wood",
      "eiche massiv", "massive eiche", "massiveiche", "buche massiv", "massive buche", "esche massiv", "kiefer massiv", "nussbaum massiv", "teak massiv",
      "chene massif", "hetre massif", "frene massif", "pin massif", "noyer massif", "teck massif",
    ],
  },
  { term: "made in", variants: ["made in", "hergestellt in", "hergestellt im", "fabrique en", "fabriquee en", "fabriques en", "produit en", "produite en", "aus deutschland", "aus portugal", "aus italien"], placeAfter: true },
  { term: "limited edition", variants: ["limited edition", "limitierte auflage", "edition limitee"], soft: true },
  { term: "award-winning", variants: ["award winning", "preisgekront", "prime"], soft: true },
  { term: "bestseller", variants: ["bestseller", "best seller", "meilleure vente"], soft: true },
  { term: "premium", variants: ["premium", "high quality", "hochwertig", "haute qualite", "top quality"], soft: true },
  { term: "natural", variants: ["natural", "100 natural", "naturlich", "naturliche", "naturlichem", "naturlichen", "naturlicher", "naturliches", "naturel", "naturelle", "naturels", "naturelles"], soft: true },
  { term: "plastic-free", variants: ["plastic free", "plastikfrei", "sans plastique"] },
  { term: "unbreakable", variants: ["unbreakable", "unzerbrechlich", "incassable"] },
  { term: "dimmable", variants: ["dimmable", "dimmbar", "a intensite variable"] },
  { term: "energy-saving", variants: ["energy saving", "energy efficient", "energiesparend", "basse consommation"] },
];

/** Words that negate the claim that follows within a few tokens (EC-B15). */
export const NEGATION_TOKENS: ReadonlyArray<string> = [
  "not",
  "no",
  "non",
  "never",
  "without",
  "isn t",
  "isnt",
  "aren t",
  "arent",
  "kein",
  "keine",
  "nicht",
  "ohne",
  "pas",
  "non",
  "sans",
  "aucun",
  "aucune",
  "jamais",
];
