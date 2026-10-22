/**
 * Base product templates for the synthetic sample generator.
 *
 * Every `allowedClaims` phrase appears verbatim (case-insensitively) in the English
 * description, notes or care text; every `negatedClaims` phrase appears inside a negation in
 * the notes ("not frost-proof"). `validateCatalog()` enforces both so the ground truth can be
 * trusted by the evaluation harness.
 */

export interface SizeOption {
  /** Option value as the supplier writes it: "20 cm", "M", "40 x 40 cm", "A5". */
  label: string;
  /** SKU segment: "20", "M", "40", "A5". */
  code: string;
  /** Price and weight multiplier relative to the template base. */
  factor: number;
}

export interface ColourOption {
  /** Canonical English colour name, lower-case. */
  label: string;
  /** SKU segment: "TC", "01". */
  code: string;
}

export interface Translation {
  title: string;
  description: string;
  category: string;
  notes?: string;
  care?: string;
}

export interface ProductTemplate {
  /** SKU stem shared by all variants: "TC-PL" → "TC-PL-20". */
  stem: string;
  titleEn: string;
  descriptionEn: string;
  /** Google-taxonomy-like path. */
  categoryPrefix: string;
  brand: string | null;
  material: string;
  care?: string;
  /** Supplier notes; where the claims and negations live. */
  notes?: string;
  sizes?: SizeOption[];
  colours?: ColourOption[];
  basePriceCents: number;
  weightGrams: number;
  /** [length, width, height] in cm for the base size; round items use length = width = diameter. */
  dimsCm: [number, number, number];
  allowedClaims: string[];
  negatedClaims: string[];
  tags: string[];
  /** Lower-case words an acceptable English title must contain. */
  keywords: string[];
  de?: Translation;
  fr?: Translation;
}

const cm = (labels: string[], factors: number[]): SizeOption[] =>
  labels.map((label, i) => ({ label, code: label.replace(/\s*(cm|m|x.*)$/i, "").replace(/\s/g, ""), factor: factors[i] ?? 1 }));
const sml = (factors: [number, number, number] = [1, 1.3, 1.6]): SizeOption[] => [
  { label: "S", code: "S", factor: factors[0] },
  { label: "M", code: "M", factor: factors[1] },
  { label: "L", code: "L", factor: factors[2] },
];
const col = (...pairs: [string, string][]): ColourOption[] => pairs.map(([label, code]) => ({ label, code }));

export const CATALOG: ProductTemplate[] = [
  // ---------------------------------------------------------------- planters
  {
    stem: "TC-PL",
    titleEn: "Terracotta Planter",
    descriptionEn:
      "Classic unglazed terracotta planter with a drainage hole and a matching saucer. The porous clay lets roots breathe and keeps soil from waterlogging. Handmade in Portugal, so small variations in colour and shape are part of each piece.",
    categoryPrefix: "Home & Garden > Decor > Planters",
    brand: "Casa Tierra",
    material: "terracotta",
    care: "Empty and store dry over winter.",
    notes: "Frost-resistant (not frost-proof, bring indoors below 0 °C). Handmade in Portugal.",
    sizes: cm(["20 cm", "30 cm", "40 cm"], [1, 1.5, 2.2]),
    basePriceCents: 1250,
    weightGrams: 900,
    dimsCm: [20, 20, 18],
    allowedClaims: ["frost-resistant", "handmade in portugal", "drainage hole"],
    negatedClaims: ["frost-proof"],
    tags: ["planter", "terracotta", "outdoor"],
    keywords: ["planter"],
    de: {
      title: "Terrakotta-Pflanztopf",
      description:
        "Klassischer unglasierter Pflanztopf aus Terrakotta mit Abzugsloch und passendem Untersetzer. Der poröse Ton lässt die Wurzeln atmen und verhindert Staunässe. Handgefertigt in Portugal, daher gehören kleine Abweichungen in Farbe und Form zu jedem Stück.",
      category: "Haus & Garten > Dekoration > Pflanzgefäße",
      notes: "Frostbeständig (nicht frostsicher, unter 0 °C ins Haus holen). Handgefertigt in Portugal. Größe = Durchmesser.",
      care: "Im Winter leeren und trocken lagern.",
    },
  },
  {
    stem: "GL-PT",
    titleEn: "Glazed Ceramic Plant Pot",
    descriptionEn:
      "Stoneware plant pot glazed inside and out, with a reactive finish that pools darker in the grooves. Suitable for indoor use with a nursery pot or as a cachepot on a shelf. Each pot is fired twice for a hard, wipe-clean surface.",
    categoryPrefix: "Home & Garden > Decor > Planters",
    brand: "Casa Tierra",
    material: "stoneware",
    notes: "Indoor use only, not frost-proof. No drainage hole.",
    colours: col(["terracotta", "TC"], ["white", "WH"], ["sage green", "SG"], ["dark blue", "DB"]),
    basePriceCents: 1890,
    weightGrams: 1100,
    dimsCm: [16, 16, 15],
    allowedClaims: ["glazed inside and out", "suitable for indoor use"],
    negatedClaims: ["frost-proof"],
    tags: ["plant pot", "ceramic", "indoor"],
    keywords: ["pot"],
    de: {
      title: "Glasierter Keramik-Blumentopf",
      description:
        "Innen und außen glasierter Steinzeug-Blumentopf mit reaktiver Glasur, die sich in den Rillen dunkler sammelt. Für den Innenbereich mit Anzuchttopf oder als Übertopf im Regal. Jeder Topf wird zweimal gebrannt und ist abwischbar.",
      category: "Haus & Garten > Dekoration > Pflanzgefäße",
      notes: "Nur für den Innenbereich, nicht frostsicher. Kein Abzugsloch.",
    },
  },
  {
    stem: "SW-PL",
    titleEn: "Self-Watering Planter",
    descriptionEn:
      "Two-part planter with a water reservoir in the base and a wick that feeds the roots for up to two weeks. Made from recycled plastic with a matte finish that hides fingerprints. A level indicator shows when to top up.",
    categoryPrefix: "Home & Garden > Decor > Planters",
    brand: "Verdi",
    material: "recycled polypropylene",
    sizes: sml([1, 1.4, 1.9]),
    basePriceCents: 2490,
    weightGrams: 600,
    dimsCm: [18, 18, 17],
    allowedClaims: ["made from recycled plastic", "water reservoir"],
    negatedClaims: [],
    tags: ["planter", "self-watering", "indoor"],
    keywords: ["planter"],
  },
  {
    stem: "ZN-TR",
    titleEn: "Zinc Planter Trough",
    descriptionEn:
      "Rectangular trough in galvanised steel with rolled edges and three pre-drilled drainage holes. Suitable for outdoor use on balconies, window ledges and along paths. Ages to a soft mottled grey over the first season.",
    categoryPrefix: "Home & Garden > Decor > Planters",
    brand: null,
    material: "galvanised steel",
    notes: "Galvanised steel resists rust but is not rust-proof; keep drainage holes clear.",
    sizes: cm(["40 cm", "60 cm"], [1, 1.5]),
    basePriceCents: 3400,
    weightGrams: 1800,
    dimsCm: [40, 15, 15],
    allowedClaims: ["galvanised steel", "suitable for outdoor use"],
    negatedClaims: ["rust-proof"],
    tags: ["planter", "trough", "zinc", "outdoor"],
    keywords: ["trough"],
  },
  {
    stem: "CN-PT",
    titleEn: "Concrete Planter",
    descriptionEn:
      "Hand-cast concrete planter with a lightly textured surface and a drainage hole. Sealed against stains, it works for succulents, herbs and small cacti. The weight keeps taller plants steady on a windowsill.",
    categoryPrefix: "Home & Garden > Decor > Planters",
    brand: "Form & Fibre",
    material: "concrete",
    notes: "Sealed against stains but not waterproof; use a saucer indoors.",
    colours: col(["grey", "GR"], ["charcoal", "CH"], ["blush pink", "BP"]),
    basePriceCents: 1590,
    weightGrams: 1400,
    dimsCm: [14, 14, 13],
    allowedClaims: ["hand-cast", "sealed"],
    negatedClaims: ["waterproof"],
    tags: ["planter", "concrete"],
    keywords: ["planter"],
  },
  // ------------------------------------------------------------ mugs/ceramics
  {
    stem: "TC-MG",
    titleEn: "Stoneware Mug",
    descriptionEn:
      "Wheel-thrown stoneware mug with a generous 350 ml capacity and a comfortable looped handle. The satin glaze is dishwasher-safe and microwave-safe for everyday use. Because each mug is thrown by hand, no two are exactly alike.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs",
    brand: "Casa Tierra",
    material: "stoneware",
    notes: "Dishwasher-safe and microwave-safe, not oven-safe.",
    colours: col(["cream", "01"], ["dark blue", "02"], ["sage green", "03"]),
    basePriceCents: 1450,
    weightGrams: 380,
    dimsCm: [12, 9, 10],
    allowedClaims: ["dishwasher-safe", "microwave-safe", "350 ml"],
    negatedClaims: ["oven-safe"],
    tags: ["mug", "stoneware", "kitchen"],
    keywords: ["mug"],
    de: {
      title: "Steinzeug-Tasse",
      description:
        "Auf der Scheibe gedrehte Steinzeug-Tasse mit großzügigen 350 ml Fassungsvermögen und bequemem Henkel. Die seidenmatte Glasur ist spülmaschinenfest und mikrowellengeeignet. Da jede Tasse von Hand gedreht wird, gleicht keine der anderen.",
      category: "Haus & Garten > Küche & Esszimmer > Geschirr > Trinkgefäße > Tassen",
      notes: "Spülmaschinenfest und mikrowellengeeignet, nicht ofenfest.",
    },
    fr: {
      title: "Mug en grès",
      description:
        "Mug en grès tourné à la main, d'une contenance généreuse de 350 ml, avec une anse confortable. L'émail satiné passe au lave-vaisselle et au micro-ondes pour un usage quotidien. Chaque mug étant tourné à la main, aucun n'est identique.",
      category: "Maison & Jardin > Cuisine & Salle à manger > Vaisselle > Mugs",
      notes: "Compatible lave-vaisselle et micro-ondes, ne va pas au four.",
    },
  },
  {
    stem: "ES-CP",
    titleEn: "Espresso Cup Set",
    descriptionEn:
      "Set of four 80 ml espresso cups in white porcelain with a thick base that holds heat. Dishwasher-safe and stackable, they take up almost no cupboard space. Saucers are not included.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Coffee & Tea Sets",
    brand: "Casa Tierra",
    material: "porcelain",
    basePriceCents: 2200,
    weightGrams: 420,
    dimsCm: [14, 14, 7],
    allowedClaims: ["set of four", "dishwasher-safe"],
    negatedClaims: [],
    tags: ["espresso", "cups", "porcelain"],
    keywords: ["espresso"],
    fr: {
      title: "Set de tasses à expresso",
      description:
        "Lot de quatre tasses à expresso de 80 ml en porcelaine blanche, avec une base épaisse qui conserve la chaleur. Compatibles lave-vaisselle et empilables, elles prennent très peu de place. Soucoupes non incluses.",
      category: "Maison & Jardin > Cuisine & Salle à manger > Vaisselle",
    },
  },
  {
    stem: "SB-BW",
    titleEn: "Serving Bowl",
    descriptionEn:
      "Deep stoneware serving bowl with a food-safe glaze in speckled oatmeal and a hand-painted metallic rim. Dishwasher-safe on a normal cycle. Sized for salads, pasta and family-style sides.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Bowls",
    brand: "Casa Tierra",
    material: "stoneware",
    notes: "Metallic rim: not microwave-safe.",
    sizes: cm(["20 cm", "26 cm"], [1, 1.45]),
    basePriceCents: 2600,
    weightGrams: 700,
    dimsCm: [20, 20, 9],
    allowedClaims: ["food-safe glaze", "dishwasher-safe"],
    negatedClaims: ["microwave-safe"],
    tags: ["bowl", "serving", "stoneware"],
    keywords: ["bowl"],
    de: {
      title: "Servierschale",
      description:
        "Tiefe Servierschale aus Steinzeug mit lebensmittelechter Glasur in gesprenkeltem Haferbeige und handbemaltem Metallicrand. Spülmaschinenfest im Normalprogramm. Passend für Salate, Pasta und Beilagen für die ganze Familie.",
      category: "Haus & Garten > Küche & Esszimmer > Geschirr > Servierschalen",
      notes: "Metallicrand: nicht mikrowellengeeignet.",
    },
  },
  {
    stem: "DN-PL",
    titleEn: "Dinner Plate",
    descriptionEn:
      "27 cm dinner plate in vitrified stoneware with a raised rim and a matte outer edge. Chip-resistant and dishwasher-safe for daily use. Made to be mixed with the rest of the range.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates",
    brand: "Casa Tierra",
    material: "stoneware",
    notes: "Chip-resistant stoneware, not unbreakable.",
    colours: col(["white", "WH"], ["charcoal", "CH"]),
    basePriceCents: 1600,
    weightGrams: 650,
    dimsCm: [27, 27, 2],
    allowedClaims: ["chip-resistant", "dishwasher-safe"],
    negatedClaims: ["unbreakable"],
    tags: ["plate", "stoneware"],
    keywords: ["plate"],
  },
  {
    stem: "TP-OT",
    titleEn: "Ceramic Teapot",
    descriptionEn:
      "900 ml teapot in glazed stoneware with a removable stainless steel infuser and a drip-free spout. The lid locks into the handle so it stays put while pouring. Hand wash only.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Serveware > Teapots",
    brand: null,
    material: "stoneware",
    notes: "Hand wash only, not dishwasher-safe.",
    basePriceCents: 3900,
    weightGrams: 850,
    dimsCm: [22, 14, 15],
    allowedClaims: ["900 ml", "stainless steel infuser"],
    negatedClaims: ["dishwasher-safe"],
    tags: ["teapot", "tea", "stoneware"],
    keywords: ["teapot"],
  },
  // ----------------------------------------------------------------- textiles
  {
    stem: "LN-CU",
    titleEn: "Linen Cushion Cover",
    descriptionEn:
      "Cushion cover in stonewashed 100% linen with a hidden zip along the bottom seam. The fabric softens with every wash and has the slubby texture linen is loved for. Machine washable at 40 °C; pad sold separately.",
    categoryPrefix: "Home & Garden > Decor > Throw Pillows",
    brand: "Hinterland",
    material: "linen",
    care: "Machine washable at 40 °C, do not tumble dry.",
    sizes: cm(["40 x 40 cm", "50 x 50 cm"], [1, 1.25]),
    colours: col(["natural", "NA"], ["rust", "RU"]),
    basePriceCents: 2900,
    weightGrams: 250,
    dimsCm: [40, 40, 1],
    allowedClaims: ["100% linen", "hidden zip", "machine washable"],
    negatedClaims: [],
    tags: ["cushion", "linen", "living room"],
    keywords: ["cushion"],
    de: {
      title: "Leinen-Kissenbezug",
      description:
        "Kissenbezug aus stonewashed 100 % Leinen mit verdecktem Reißverschluss an der unteren Naht. Der Stoff wird mit jeder Wäsche weicher und hat die typische Leinenstruktur. Waschbar bei 40 °C; Inlett separat erhältlich.",
      category: "Haus & Garten > Dekoration > Zierkissen",
      care: "Waschmaschine 40 °C, nicht trocknergeeignet.",
    },
    fr: {
      title: "Housse de coussin en lin",
      description:
        "Housse de coussin en lin lavé 100 % lin avec fermeture éclair invisible sur la couture du bas. Le tissu s'adoucit à chaque lavage et conserve la texture flammée propre au lin. Lavable en machine à 40 °C ; garnissage vendu séparément.",
      category: "Maison & Jardin > Décoration > Coussins",
      care: "Lavable en machine à 40 °C, ne pas sécher au sèche-linge.",
    },
  },
  {
    stem: "WL-TH",
    titleEn: "Wool Throw",
    descriptionEn:
      "Herringbone throw in 100% merino wool, woven in Scotland on traditional looms and finished with a fringed edge. Generous 130 x 180 cm size for sofas and beds. Dry clean only.",
    categoryPrefix: "Home & Garden > Linens & Bedding > Bedding > Blankets",
    brand: "Hinterland",
    material: "merino wool",
    notes: "Dry clean only; not machine washable.",
    colours: col(["grey", "GR"], ["mustard", "MU"], ["forest green", "FG"]),
    basePriceCents: 7900,
    weightGrams: 1200,
    dimsCm: [180, 130, 1],
    allowedClaims: ["100% merino wool", "woven in scotland"],
    negatedClaims: ["machine washable"],
    tags: ["throw", "wool", "blanket"],
    keywords: ["throw"],
  },
  {
    stem: "CT-RN",
    titleEn: "Cotton Table Runner",
    descriptionEn:
      "Table runner in 100% organic cotton with a woven stripe and hand-knotted tassels at both ends. Measures 40 x 150 cm and is machine washable at 40 °C. The natural dyes mellow gently over time.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Tableware > Table Linens",
    brand: "Hinterland",
    material: "organic cotton",
    care: "Machine washable at 40 °C.",
    basePriceCents: 2400,
    weightGrams: 300,
    dimsCm: [150, 40, 1],
    allowedClaims: ["100% organic cotton", "machine washable"],
    negatedClaims: [],
    tags: ["table runner", "cotton", "dining"],
    keywords: ["runner"],
    fr: {
      title: "Chemin de table en coton",
      description:
        "Chemin de table en coton 100 % biologique avec rayure tissée et pompons noués à la main aux deux extrémités. Mesure 40 x 150 cm et se lave en machine à 40 °C. Les teintures naturelles s'adoucissent avec le temps.",
      category: "Maison & Jardin > Linge de maison > Linge de table > Chemins de table",
      care: "Lavable en machine à 40 °C.",
    },
  },
  {
    stem: "JT-RG",
    titleEn: "Jute Rug",
    descriptionEn:
      "Hand-woven rug in natural jute with a braided border and a soft underside that will not scratch floors. Suits hallways and living rooms; indoor only. Vacuum regularly and spot clean with a damp cloth.",
    categoryPrefix: "Home & Garden > Decor > Rugs",
    brand: null,
    material: "jute",
    notes: "Indoor only; not suitable for outdoor use.",
    sizes: cm(["120 x 180 cm", "160 x 230 cm"], [1, 1.7]),
    basePriceCents: 8900,
    weightGrams: 4500,
    dimsCm: [180, 120, 1],
    allowedClaims: ["hand-woven", "natural jute"],
    negatedClaims: ["suitable for outdoor use"],
    tags: ["rug", "jute", "natural"],
    keywords: ["rug"],
  },
  {
    stem: "VL-CU",
    titleEn: "Velvet Cushion",
    descriptionEn:
      "Plump cushion in cotton velvet with a feather pad included and a piped edge in the same shade. The pile catches the light so the colour shifts from deep to bright across the day. Cover is spot clean only.",
    categoryPrefix: "Home & Garden > Decor > Throw Pillows",
    brand: "Hinterland",
    material: "cotton velvet",
    notes: "Spot clean only, not machine washable.",
    colours: col(["teal", "TE"], ["blush pink", "BP"], ["ochre", "OC"]),
    basePriceCents: 3400,
    weightGrams: 600,
    dimsCm: [45, 45, 12],
    allowedClaims: ["feather pad included", "cotton velvet"],
    negatedClaims: ["machine washable"],
    tags: ["cushion", "velvet"],
    keywords: ["cushion"],
    de: {
      title: "Samtkissen",
      description:
        "Pralles Kissen aus Baumwollsamt mit Federfüllung und Paspel in derselben Farbe. Der Flor fängt das Licht ein, sodass die Farbe im Tagesverlauf zwischen tief und leuchtend wechselt. Bezug nur punktuell reinigen.",
      category: "Haus & Garten > Dekoration > Zierkissen",
      notes: "Nur punktuell reinigen, nicht waschmaschinengeeignet.",
    },
  },
  // ------------------------------------------------------------------ candles
  {
    stem: "BW-CA",
    titleEn: "Beeswax Pillar Candle",
    descriptionEn:
      "Hand-poured pillar candle in 100% beeswax with a cotton wick and a faint natural honey scent. Burns slowly with very little smoke. Trim the wick to 5 mm before each use.",
    categoryPrefix: "Home & Garden > Decor > Candles",
    brand: "Hive & Wick",
    material: "beeswax",
    notes: "Burns clean but is not dripless; always use a holder.",
    sizes: cm(["10 cm", "15 cm", "20 cm"], [1, 1.5, 2]),
    basePriceCents: 1800,
    weightGrams: 300,
    dimsCm: [6, 6, 10],
    allowedClaims: ["100% beeswax", "cotton wick", "hand-poured"],
    negatedClaims: ["dripless"],
    tags: ["candle", "beeswax"],
    keywords: ["candle"],
    de: {
      title: "Bienenwachs-Stumpenkerze",
      description:
        "Handgegossene Stumpenkerze aus 100 % Bienenwachs mit Baumwolldocht und zartem natürlichem Honigduft. Brennt langsam und nahezu rußfrei ab. Docht vor jedem Anzünden auf 5 mm kürzen.",
      category: "Haus & Garten > Dekoration > Kerzen",
      notes: "Brennt sauber, ist aber nicht tropffrei; immer einen Halter verwenden. Größe = Höhe.",
    },
  },
  {
    stem: "SY-CA",
    titleEn: "Soy Wax Scented Candle",
    descriptionEn:
      "Hand-poured soy wax candle in a reusable amber glass jar, scented with fig and cedar essential oils. Roughly 40 hour burn time from a single cotton wick. Comes in a kraft gift box.",
    categoryPrefix: "Home & Garden > Decor > Candles",
    brand: "Hive & Wick",
    material: "soy wax",
    notes: "Essential-oil fragrance, not certified organic.",
    basePriceCents: 2200,
    weightGrams: 450,
    dimsCm: [8, 8, 9],
    allowedClaims: ["soy wax", "40 hour burn time", "hand-poured"],
    negatedClaims: ["certified organic"],
    tags: ["candle", "scented", "soy"],
    keywords: ["candle"],
  },
  {
    stem: "TL-ST",
    titleEn: "Tealight Set",
    descriptionEn:
      "Pack of 50 unscented tealights in aluminium cups, each with a 4 hour burn time. Fits all standard tealight holders and lanterns. Stored in a resealable box.",
    categoryPrefix: "Home & Garden > Decor > Candles",
    brand: "Hive & Wick",
    material: "paraffin wax",
    basePriceCents: 800,
    weightGrams: 500,
    dimsCm: [20, 20, 5],
    allowedClaims: ["pack of 50", "4 hour burn time"],
    negatedClaims: [],
    tags: ["tealight", "candle"],
    keywords: ["tealight"],
    fr: {
      title: "Lot de bougies chauffe-plat",
      description:
        "Lot de 50 bougies chauffe-plat non parfumées en coupelles aluminium, avec 4 heures de combustion chacune. Convient à tous les photophores et lanternes standard. Livré dans une boîte refermable.",
      category: "Maison & Jardin > Décoration > Bougies",
    },
  },
  {
    stem: "BR-CH",
    titleEn: "Brass Candle Holder",
    descriptionEn:
      "Turned candle holder in solid brass with a weighted base that fits standard taper candles. The surface is left unlacquered so it develops a warm patina over time. Polish with a soft cloth to restore the shine.",
    categoryPrefix: "Home & Garden > Decor > Candle Holders",
    brand: null,
    material: "brass",
    notes: "Unlacquered brass develops a patina; not lacquered.",
    sizes: sml([1, 1.25, 1.5]),
    basePriceCents: 2600,
    weightGrams: 350,
    dimsCm: [7, 7, 12],
    allowedClaims: ["solid brass", "fits standard taper candles"],
    negatedClaims: ["lacquered"],
    tags: ["candle holder", "brass"],
    keywords: ["holder"],
  },
  {
    stem: "TP-CA",
    titleEn: "Taper Candles",
    descriptionEn:
      "Set of six 25 cm taper candles, dipped by hand in paraffin-free rapeseed wax. Each burns for about 8 hours with a steady flame. Colours are dyed through, not coated.",
    categoryPrefix: "Home & Garden > Decor > Candles",
    brand: "Hive & Wick",
    material: "rapeseed wax",
    colours: col(["ochre", "OC"], ["forest green", "FG"], ["burgundy", "BU"]),
    basePriceCents: 1400,
    weightGrams: 200,
    dimsCm: [25, 2, 2],
    allowedClaims: ["set of six", "paraffin-free"],
    negatedClaims: [],
    tags: ["candle", "taper"],
    keywords: ["taper"],
  },
  // ------------------------------------------------------------ kitchen tools
  {
    stem: "OW-SP",
    titleEn: "Olive Wood Spoon Set",
    descriptionEn:
      "Set of three cooking spoons carved from olive wood and hand-finished with food-grade oil. The dense grain resists staining and will not scratch non-stick pans. Hand wash and re-oil occasionally.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cooking Utensils",
    brand: "Oliva",
    material: "olive wood",
    notes: "Hand wash, not dishwasher-safe.",
    basePriceCents: 1900,
    weightGrams: 180,
    dimsCm: [30, 6, 2],
    allowedClaims: ["olive wood", "set of three", "hand-finished"],
    negatedClaims: ["dishwasher-safe"],
    tags: ["spoon", "olive wood", "kitchen"],
    keywords: ["spoon"],
    de: {
      title: "Kochlöffel-Set aus Olivenholz",
      description:
        "Set aus drei Kochlöffeln, aus Olivenholz geschnitzt und von Hand mit lebensmittelechtem Öl behandelt. Die dichte Maserung ist fleckunempfindlich und schont beschichtete Pfannen. Von Hand spülen und gelegentlich nachölen.",
      category: "Haus & Garten > Küche & Esszimmer > Küchenhelfer",
      notes: "Von Hand spülen, nicht spülmaschinenfest.",
    },
  },
  {
    stem: "BB-CB",
    titleEn: "Bamboo Cutting Board",
    descriptionEn:
      "Thick end-grain bamboo cutting board with a juice groove on one side and a flat side for bread and cheese. Bamboo is harder than maple and kind to knife edges. Oil monthly to stop it drying out.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cutting Boards",
    brand: "Oliva",
    material: "bamboo",
    notes: "Hand wash only, not dishwasher-safe.",
    sizes: sml([1, 1.4, 1.8]),
    basePriceCents: 2200,
    weightGrams: 900,
    dimsCm: [30, 20, 2],
    allowedClaims: ["bamboo", "juice groove"],
    negatedClaims: ["dishwasher-safe"],
    tags: ["cutting board", "bamboo"],
    keywords: ["board"],
  },
  {
    stem: "SS-WK",
    titleEn: "Stainless Steel Whisk",
    descriptionEn:
      "Balloon whisk in 18/8 stainless steel with twelve wires and a sealed, weighted handle. Dishwasher-safe and rust-resistant. 30 cm long, so it reaches the corners of a tall jug.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cooking Utensils",
    brand: "Oliva",
    material: "stainless steel",
    basePriceCents: 1299,
    weightGrams: 120,
    dimsCm: [30, 7, 7],
    allowedClaims: ["stainless steel", "dishwasher-safe"],
    negatedClaims: [],
    tags: ["whisk", "kitchen"],
    keywords: ["whisk"],
  },
  {
    stem: "CI-SK",
    titleEn: "Cast-Iron Skillet",
    descriptionEn:
      "Pre-seasoned cast-iron skillet with two pour spouts and a helper handle. Oven-safe to 260 °C and induction compatible, it goes from hob to oven to table. Builds a natural non-stick surface with use.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Cookware > Pots & Pans",
    brand: "Oliva",
    material: "cast iron",
    notes: "Never soak; not dishwasher-safe. Dry and oil after washing.",
    sizes: cm(["20 cm", "26 cm"], [1, 1.5]),
    basePriceCents: 4500,
    weightGrams: 1800,
    dimsCm: [20, 20, 5],
    allowedClaims: ["pre-seasoned", "oven-safe", "induction compatible"],
    negatedClaims: ["dishwasher-safe"],
    tags: ["skillet", "cast iron", "cookware"],
    keywords: ["skillet"],
    de: {
      title: "Gusseisenpfanne",
      description:
        "Eingebrannte Gusseisenpfanne mit zwei Ausgießern und Gegengriff. Ofenfest bis 260 °C und induktionsgeeignet, vom Herd in den Ofen auf den Tisch. Entwickelt mit der Zeit eine natürliche Antihaftschicht.",
      category: "Haus & Garten > Küche & Esszimmer > Kochgeschirr > Pfannen",
      notes: "Nie einweichen; nicht spülmaschinenfest. Nach dem Spülen trocknen und einölen. Größe = Durchmesser.",
    },
  },
  {
    stem: "SI-SP",
    titleEn: "Silicone Spatula Set",
    descriptionEn:
      "Set of three spatulas in BPA-free silicone over a stainless steel core. Heat-resistant to 230 °C and safe on non-stick coatings. Dishwasher-safe and one-piece, so nothing collects in the seams.",
    categoryPrefix: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cooking Utensils",
    brand: "Oliva",
    material: "silicone",
    colours: col(["red", "RD"], ["grey", "GR"], ["mustard", "MU"]),
    basePriceCents: 1300,
    weightGrams: 150,
    dimsCm: [28, 6, 2],
    allowedClaims: ["bpa-free", "heat-resistant", "set of three", "dishwasher-safe"],
    negatedClaims: [],
    tags: ["spatula", "silicone"],
    keywords: ["spatula"],
  },
  // ------------------------------------------------------------- garden tools
  {
    stem: "GT-TR",
    titleEn: "Hand Trowel",
    descriptionEn:
      "Hand trowel with a stainless steel blade and an ash handle that is oiled rather than varnished for better grip. The blade has depth marks for bulbs and a sharpened edge for cutting roots. Leather loop for hanging.",
    categoryPrefix: "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Hand Trowels",
    brand: "Greenhand",
    material: "stainless steel",
    basePriceCents: 1500,
    weightGrams: 300,
    dimsCm: [30, 8, 4],
    allowedClaims: ["stainless steel", "ash handle"],
    negatedClaims: [],
    tags: ["trowel", "garden tool"],
    keywords: ["trowel"],
  },
  {
    stem: "GT-PS",
    titleEn: "Pruning Shears",
    descriptionEn:
      "Bypass pruning shears with carbon steel blades and a sap groove, cutting live stems up to 20 mm cleanly. The aluminium handles are shaped for right-handed use. Blades can be replaced.",
    categoryPrefix: "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Pruning Shears",
    brand: "Greenhand",
    material: "carbon steel",
    notes: "Right-handed model; not suitable for left-handed use.",
    basePriceCents: 2900,
    weightGrams: 280,
    dimsCm: [21, 7, 3],
    allowedClaims: ["carbon steel blades", "bypass"],
    negatedClaims: ["suitable for left-handed use"],
    tags: ["pruning", "shears", "garden tool"],
    keywords: ["shears"],
  },
  {
    stem: "WC-CN",
    titleEn: "Watering Can",
    descriptionEn:
      "5 litre watering can in galvanised steel with a long spout and a removable rose for a fine spray on seedlings. Powder-coated inside and out so it will not drip rust onto the patio. Balanced to carry full with one hand.",
    categoryPrefix: "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Watering Cans",
    brand: "Greenhand",
    material: "galvanised steel",
    colours: col(["sage green", "SG"], ["grey", "GR"], ["ochre", "OC"]),
    basePriceCents: 2400,
    weightGrams: 700,
    dimsCm: [48, 18, 25],
    allowedClaims: ["5 litre", "removable rose", "galvanised steel"],
    negatedClaims: [],
    tags: ["watering can", "garden"],
    keywords: ["watering"],
    de: {
      title: "Gießkanne",
      description:
        "5-Liter-Gießkanne aus verzinktem Stahl mit langer Tülle und abnehmbarem Brausekopf für feinen Sprühnebel auf Sämlingen. Innen und außen pulverbeschichtet, damit kein Rost auf die Terrasse tropft. Ausbalanciert zum einhändigen Tragen.",
      category: "Haus & Garten > Garten > Gartenarbeit > Gießkannen",
      notes: "Größe: 5 Liter Fassungsvermögen. Lieferung ohne Wasser-Enthärter.",
    },
  },
  {
    stem: "GG-GL",
    titleEn: "Garden Gloves",
    descriptionEn:
      "Lightweight garden gloves with a latex-coated palm for grip and a breathable knitted back. Good for weeding, potting and light pruning. Machine wash cold and air dry.",
    categoryPrefix: "Home & Garden > Lawn & Garden > Gardening > Gardening Gloves",
    brand: "Greenhand",
    material: "nylon, latex",
    notes: "Water-resistant palm, not waterproof.",
    sizes: sml([1, 1, 1]),
    basePriceCents: 1200,
    weightGrams: 90,
    dimsCm: [24, 12, 2],
    allowedClaims: ["latex-coated palm", "breathable"],
    negatedClaims: ["waterproof"],
    tags: ["gloves", "garden"],
    keywords: ["gloves"],
  },
  {
    stem: "KN-PD",
    titleEn: "Kneeling Pad",
    descriptionEn:
      "Thick memory foam kneeling pad with a wipe clean cover and a carry handle. Saves knees during planting and weeding and doubles as a seat cushion for camping. Dries quickly after rain.",
    categoryPrefix: "Home & Garden > Lawn & Garden > Gardening > Gardening Accessories",
    brand: null,
    material: "memory foam",
    basePriceCents: 1400,
    weightGrams: 250,
    dimsCm: [45, 30, 4],
    allowedClaims: ["memory foam", "wipe clean"],
    negatedClaims: [],
    tags: ["kneeling pad", "garden"],
    keywords: ["kneeling"],
  },
  // ---------------------------------------------------------- small furniture
  {
    stem: "OK-ST",
    titleEn: "Oak Side Table",
    descriptionEn:
      "Round side table in solid oak with a turned pedestal base and a hand-oiled top. The timber is FSC-certified and finished without stain, so the grain shows through. Delivered flat-packed with two fixings.",
    categoryPrefix: "Furniture > Tables > Accent Tables > End Tables",
    brand: "Hinterland",
    material: "oak",
    care: "Wipe with a damp cloth; re-oil once a year.",
    colours: col(["natural oak", "NO"], ["smoked oak", "SO"]),
    basePriceCents: 129900,
    weightGrams: 6500,
    dimsCm: [45, 45, 55],
    allowedClaims: ["solid oak", "fsc-certified", "flat-packed"],
    negatedClaims: [],
    tags: ["side table", "oak", "furniture"],
    keywords: ["table"],
    de: {
      title: "Beistelltisch aus Eiche",
      description:
        "Runder Beistelltisch aus massiver Eiche mit gedrechseltem Säulenfuß und handgeölter Platte. Das Holz ist FSC-zertifiziert und ohne Beize behandelt, sodass die Maserung sichtbar bleibt. Lieferung zerlegt mit zwei Schrauben.",
      category: "Möbel > Tische > Beistelltische",
      care: "Mit feuchtem Tuch abwischen; einmal jährlich nachölen.",
    },
  },
  {
    stem: "FD-SL",
    titleEn: "Folding Stool",
    descriptionEn:
      "Folding stool in solid beech wood with a canvas seat that holds up to 120 kg. Folds flat to 4 cm for storage behind a door. Indoor use only.",
    categoryPrefix: "Furniture > Chairs > Stools",
    brand: "Hinterland",
    material: "beech wood",
    notes: "Indoor use only; not suitable for outdoor use.",
    colours: col(["black", "BK"], ["natural", "NA"]),
    basePriceCents: 4900,
    weightGrams: 2100,
    dimsCm: [40, 35, 45],
    allowedClaims: ["beech wood", "folds flat", "holds up to 120 kg"],
    negatedClaims: ["suitable for outdoor use"],
    tags: ["stool", "folding", "furniture"],
    keywords: ["stool"],
  },
  {
    stem: "WS-SH",
    titleEn: "Wall Shelf",
    descriptionEn:
      "Floating wall shelf in solid pine with a hidden steel bracket and all fixings included. Holds up to 10 kg of books when mounted into masonry or studs. Sanded smooth and left unfinished for painting or oiling.",
    categoryPrefix: "Furniture > Shelving > Wall Shelves & Ledges",
    brand: "Hinterland",
    material: "pine",
    sizes: cm(["60 cm", "90 cm"], [1, 1.4]),
    basePriceCents: 3900,
    weightGrams: 1800,
    dimsCm: [60, 20, 4],
    allowedClaims: ["pine", "fixings included"],
    negatedClaims: [],
    tags: ["shelf", "wall", "furniture"],
    keywords: ["shelf"],
  },
  {
    stem: "BS-TB",
    titleEn: "Bedside Table",
    descriptionEn:
      "Bedside table with one drawer and an open shelf, in ash veneer over an engineered board with solid ash legs. The drawer runs on wooden runners and has a cut-out pull instead of a handle. Arrives assembled.",
    categoryPrefix: "Furniture > Tables > Nightstands",
    brand: "Hinterland",
    material: "ash veneer",
    notes: "Ash veneer over engineered board, not solid wood.",
    basePriceCents: 14900,
    weightGrams: 7000,
    dimsCm: [45, 38, 55],
    allowedClaims: ["one drawer", "ash veneer"],
    negatedClaims: ["solid wood"],
    tags: ["bedside table", "nightstand", "furniture"],
    keywords: ["bedside"],
    fr: {
      title: "Table de chevet",
      description:
        "Table de chevet avec un tiroir et une niche ouverte, en placage de frêne sur panneau et pieds en frêne massif. Le tiroir coulisse sur des glissières en bois et s'ouvre par une prise découpée. Livrée montée.",
      category: "Meubles > Tables > Tables de chevet",
      notes: "Placage de frêne sur panneau, pas en bois massif.",
    },
  },
  {
    stem: "PL-SD",
    titleEn: "Plant Stand",
    descriptionEn:
      "Plant stand in powder-coated steel with a round top that takes pots up to 25 cm across. Suitable for indoor use; the slim legs keep it light enough to move with the plant on it. Comes in two heights.",
    categoryPrefix: "Home & Garden > Decor > Plant Stands",
    brand: "Form & Fibre",
    material: "powder-coated steel",
    notes: "Indoor use only; not suitable for outdoor use.",
    sizes: cm(["30 cm", "50 cm"], [1, 1.3]),
    basePriceCents: 2900,
    weightGrams: 900,
    dimsCm: [26, 26, 30],
    allowedClaims: ["powder-coated steel", "suitable for indoor use"],
    negatedClaims: ["suitable for outdoor use"],
    tags: ["plant stand", "steel"],
    keywords: ["stand"],
  },
  // ----------------------------------------------------------------- lighting
  {
    stem: "RT-PD",
    titleEn: "Rattan Pendant Lamp",
    descriptionEn:
      "Pendant shade in hand-woven rattan over a steel frame, with a 1.5 m fabric cord and an E27 fitting. The open weave throws a soft pattern on the ceiling. Bulb not included.",
    categoryPrefix: "Home & Garden > Lighting > Lighting Fixtures > Pendant Lights",
    brand: "Lumo",
    material: "rattan",
    sizes: cm(["35 cm", "50 cm"], [1, 1.5]),
    basePriceCents: 8900,
    weightGrams: 1300,
    dimsCm: [35, 35, 28],
    allowedClaims: ["hand-woven rattan", "e27 fitting", "bulb not included"],
    negatedClaims: [],
    tags: ["pendant", "lamp", "rattan"],
    keywords: ["pendant"],
    de: {
      title: "Rattan-Pendelleuchte",
      description:
        "Pendelschirm aus handgeflochtenem Rattan auf Stahlrahmen, mit 1,5 m Textilkabel und E27-Fassung. Das offene Geflecht wirft ein weiches Muster an die Decke. Leuchtmittel nicht enthalten.",
      category: "Haus & Garten > Beleuchtung > Leuchten > Pendelleuchten",
      notes: "Größe = Durchmesser des Schirms.",
    },
  },
  {
    stem: "CR-TL",
    titleEn: "Ceramic Table Lamp",
    descriptionEn:
      "Table lamp with a glazed ceramic base and a drum-shaped natural linen shade, wired with an inline switch and an E14 fitting. The glaze is applied by hand so the finish varies slightly. Bulb not included.",
    categoryPrefix: "Home & Garden > Lighting > Lamps > Table Lamps",
    brand: "Lumo",
    material: "ceramic",
    notes: "Not dimmable.",
    colours: col(["cream", "CR"], ["sage green", "SG"]),
    basePriceCents: 6900,
    weightGrams: 2200,
    dimsCm: [30, 30, 48],
    allowedClaims: ["linen shade", "e14 fitting"],
    negatedClaims: ["dimmable"],
    tags: ["table lamp", "ceramic"],
    keywords: ["lamp"],
  },
  {
    stem: "LD-DL",
    titleEn: "LED Desk Lamp",
    descriptionEn:
      "Slim LED desk lamp with a dimmable touch panel, 3 colour temperatures and a USB-C charging port in the base. The arm folds flat when not in use. 7 W, 450 lumens.",
    categoryPrefix: "Home & Garden > Lighting > Lamps > Desk Lamps",
    brand: "Lumo",
    material: "aluminium",
    colours: col(["white", "WH"], ["black", "BK"]),
    basePriceCents: 4500,
    weightGrams: 800,
    dimsCm: [40, 12, 38],
    allowedClaims: ["dimmable", "usb-c", "3 colour temperatures"],
    negatedClaims: [],
    tags: ["desk lamp", "led"],
    keywords: ["lamp"],
  },
  {
    stem: "SL-LT",
    titleEn: "String Lights",
    descriptionEn:
      "Warm white LED string lights on a dark green cable with an IP44 transformer, rated for covered outdoor areas. 8 lighting modes with a memory function. Plug-in, with a 3 m lead cable.",
    categoryPrefix: "Home & Garden > Lighting > Lighting Fixtures > String Lights",
    brand: "Lumo",
    material: "pvc, led",
    notes: "IP44 splash-proof, not waterproof; do not submerge.",
    sizes: cm(["5 m", "10 m"], [1, 1.7]),
    basePriceCents: 1900,
    weightGrams: 350,
    dimsCm: [500, 1, 1],
    allowedClaims: ["warm white", "ip44"],
    negatedClaims: ["waterproof"],
    tags: ["string lights", "led", "outdoor"],
    keywords: ["lights"],
  },
  {
    stem: "FL-LP",
    titleEn: "Floor Lamp",
    descriptionEn:
      "Arc floor lamp in brushed brass with a marble base and a foot switch on the cable. The shade pivots to direct light over a sofa or reading chair. Takes one E27 bulb up to 60 W.",
    categoryPrefix: "Home & Garden > Lighting > Lamps > Floor Lamps",
    brand: null,
    material: "brass, marble",
    basePriceCents: 11900,
    weightGrams: 4200,
    dimsCm: [30, 30, 160],
    allowedClaims: ["brushed brass", "foot switch"],
    negatedClaims: [],
    tags: ["floor lamp", "brass"],
    keywords: ["lamp"],
    fr: {
      title: "Lampadaire",
      description:
        "Lampadaire arqué en laiton brossé avec socle en marbre et interrupteur à pied sur le câble. L'abat-jour pivote pour diriger la lumière vers un canapé ou un fauteuil de lecture. Ampoule E27 jusqu'à 60 W.",
      category: "Maison & Jardin > Éclairage > Lampes > Lampadaires",
    },
  },
  // ------------------------------------------------------------- pet supplies
  {
    stem: "PT-BW",
    titleEn: "Ceramic Pet Bowl",
    descriptionEn:
      "Heavy stoneware pet bowl with a non-slip base and a wide rim that keeps whiskers clear. Dishwasher-safe and glazed with a lead-free finish. Three sizes from cat to large dog.",
    categoryPrefix: "Animals & Pet Supplies > Pet Supplies > Pet Bowls, Feeders & Waterers",
    brand: "Pawfolk",
    material: "stoneware",
    sizes: sml([1, 1.4, 1.9]),
    basePriceCents: 1900,
    weightGrams: 600,
    dimsCm: [15, 15, 6],
    allowedClaims: ["dishwasher-safe", "non-slip base"],
    negatedClaims: [],
    tags: ["pet bowl", "ceramic", "dog", "cat"],
    keywords: ["bowl"],
    de: {
      title: "Keramik-Futternapf",
      description:
        "Schwerer Steinzeug-Napf mit rutschfester Unterseite und breitem Rand, der die Schnurrhaare freihält. Spülmaschinenfest und mit bleifreier Glasur. Drei Größen von Katze bis großer Hund.",
      category: "Tiere & Tierbedarf > Tierbedarf > Näpfe & Tränken",
      notes: "Größe S für Katzen, M für kleine Hunde, L für große Hunde.",
    },
  },
  {
    stem: "RP-TY",
    titleEn: "Rope Dog Toy",
    descriptionEn:
      "Knotted tug toy in thick cotton rope, 35 cm long with a loop handle at one end. Machine washable at 30 °C and dries on the line. Suitable for medium and large dogs.",
    categoryPrefix: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys",
    brand: "Pawfolk",
    material: "cotton rope",
    notes: "Tough, but not indestructible; supervise play.",
    basePriceCents: 900,
    weightGrams: 200,
    dimsCm: [35, 5, 5],
    allowedClaims: ["cotton rope", "machine washable"],
    negatedClaims: ["indestructible"],
    tags: ["dog toy", "rope"],
    keywords: ["toy"],
  },
  {
    stem: "CS-PT",
    titleEn: "Cat Scratching Post",
    descriptionEn:
      "60 cm scratching post wrapped in natural sisal on a solid base of carpeted MDF. Heavy enough that it will not tip when a large cat leans into it. Replacement sisal sleeves are available.",
    categoryPrefix: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture",
    brand: "Pawfolk",
    material: "sisal, mdf",
    basePriceCents: 3900,
    weightGrams: 3200,
    dimsCm: [40, 40, 60],
    allowedClaims: ["sisal", "solid base"],
    negatedClaims: [],
    tags: ["cat", "scratching post"],
    keywords: ["scratching"],
  },
  {
    stem: "PT-BD",
    titleEn: "Pet Bed",
    descriptionEn:
      "Bolster pet bed with a removable cover and a recycled polyester filling that keeps its loft. The cover is machine washable at 40 °C and the base has a non-slip print. Water-resistant, not waterproof.",
    categoryPrefix: "Animals & Pet Supplies > Pet Supplies > Pet Beds",
    brand: "Pawfolk",
    material: "polyester",
    notes: "Water-resistant base, not waterproof.",
    sizes: sml([1, 1.5, 2.2]),
    basePriceCents: 4900,
    weightGrams: 1500,
    dimsCm: [60, 45, 18],
    allowedClaims: ["removable cover", "machine washable", "recycled polyester filling"],
    negatedClaims: ["waterproof"],
    tags: ["pet bed", "dog", "cat"],
    keywords: ["bed"],
  },
  {
    stem: "DG-LS",
    titleEn: "Dog Leash",
    descriptionEn:
      "150 cm dog leash in woven polyester webbing with reflective stitching along both edges and a padded handle. The trigger clip is solid brass. Wipe clean.",
    categoryPrefix: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Leashes",
    brand: "Pawfolk",
    material: "polyester webbing",
    colours: col(["red", "RD"], ["navy", "NV"], ["forest green", "FG"]),
    basePriceCents: 1800,
    weightGrams: 150,
    dimsCm: [150, 2.5, 1],
    allowedClaims: ["150 cm", "reflective stitching"],
    negatedClaims: [],
    tags: ["dog", "leash"],
    keywords: ["leash"],
  },
  // --------------------------------------------------------------- stationery
  {
    stem: "LN-NB",
    titleEn: "Linen Notebook",
    descriptionEn:
      "A5 notebook with a linen cover, 192 dotted pages of FSC-certified paper and a ribbon marker. The lay-flat binding is sewn, not glued. Paper is 100 gsm and takes fountain pen ink without bleeding.",
    categoryPrefix: "Office Supplies > General Office Supplies > Paper Products > Notebooks",
    brand: "Folio",
    material: "linen, paper",
    colours: col(["natural", "NA"], ["dark blue", "DB"], ["rust", "RU"]),
    basePriceCents: 1600,
    weightGrams: 300,
    dimsCm: [21, 15, 1.5],
    allowedClaims: ["linen cover", "dotted pages", "fsc-certified paper"],
    negatedClaims: [],
    tags: ["notebook", "stationery"],
    keywords: ["notebook"],
    de: {
      title: "Notizbuch mit Leineneinband",
      description:
        "A5-Notizbuch mit Leineneinband, 192 gepunkteten Seiten aus FSC-zertifiziertem Papier und Lesebändchen. Die Fadenheftung liegt flach auf und ist genäht, nicht geklebt. 100 g/m² Papier, das Füllertinte ohne Durchschlagen aufnimmt.",
      category: "Bürobedarf > Allgemeiner Bürobedarf > Papierprodukte > Notizbücher",
    },
    fr: {
      title: "Carnet en lin",
      description:
        "Carnet A5 à couverture en lin, 192 pages pointillées en papier certifié FSC et signet en ruban. La reliure cousue s'ouvre à plat. Papier 100 g/m² adapté au stylo plume, sans traversée d'encre.",
      category: "Fournitures de bureau > Fournitures générales > Papeterie > Carnets",
    },
  },
  {
    stem: "FP-PN",
    titleEn: "Fountain Pen",
    descriptionEn:
      "Fountain pen with a medium steel nib and a brushed aluminium barrel, converter included for bottled ink. Takes standard international cartridges as well. Writes wet with a slight line variation.",
    categoryPrefix: "Office Supplies > General Office Supplies > Writing & Drawing Instruments > Pens",
    brand: "Folio",
    material: "aluminium",
    basePriceCents: 3200,
    weightGrams: 40,
    dimsCm: [14, 1.3, 1.3],
    allowedClaims: ["steel nib", "converter included"],
    negatedClaims: [],
    tags: ["pen", "fountain pen", "stationery"],
    keywords: ["pen"],
  },
  {
    stem: "DK-OR",
    titleEn: "Desk Organiser",
    descriptionEn:
      "Desk organiser in oak veneer with five compartments for pens, phone, cards and clips, felt lined to stop things rattling. Sits flat on the desk without feet. Dust with a dry cloth.",
    categoryPrefix: "Office Supplies > General Office Supplies > Desk Organizers",
    brand: "Folio",
    material: "oak veneer",
    notes: "Oak veneer over birch ply, not solid oak.",
    basePriceCents: 2800,
    weightGrams: 700,
    dimsCm: [25, 15, 8],
    allowedClaims: ["oak veneer", "felt lined"],
    negatedClaims: ["solid oak"],
    tags: ["desk organiser", "stationery"],
    keywords: ["organiser"],
  },
  {
    stem: "RP-PD",
    titleEn: "Recycled Paper Pad",
    descriptionEn:
      "Writing pad of 80 sheets in 100% recycled paper, ruled with a faint grey line and glued at the head for clean tearing. Backed with a thick grey board. Available in A4 and A5.",
    categoryPrefix: "Office Supplies > General Office Supplies > Paper Products > Notepads",
    brand: "Folio",
    material: "recycled paper",
    sizes: [
      { label: "A4", code: "A4", factor: 1.5 },
      { label: "A5", code: "A5", factor: 1 },
    ],
    basePriceCents: 800,
    weightGrams: 250,
    dimsCm: [21, 15, 1],
    allowedClaims: ["100% recycled paper", "80 sheets"],
    negatedClaims: [],
    tags: ["notepad", "recycled", "stationery"],
    keywords: ["pad"],
  },
  {
    stem: "BR-SH",
    titleEn: "Brass Pencil Sharpener",
    descriptionEn:
      "Single-hole pencil sharpener machined from solid brass with a replacement blade included in the box. The weight keeps it steady on the desk. Fits standard and jumbo pencils.",
    categoryPrefix: "Office Supplies > General Office Supplies > Writing & Drawing Instruments > Pencil Sharpeners",
    brand: null,
    material: "brass",
    basePriceCents: 1400,
    weightGrams: 80,
    dimsCm: [4, 2.5, 2.5],
    allowedClaims: ["solid brass", "replacement blade included"],
    negatedClaims: [],
    tags: ["sharpener", "brass", "stationery"],
    keywords: ["sharpener"],
  },
  // --------------------------------------------------------------------- toys
  {
    stem: "WD-BL",
    titleEn: "Wooden Stacking Blocks",
    descriptionEn:
      "Set of 24 stacking blocks in beech wood, coloured with water-based paint and sanded with rounded edges. Suitable from 12 months. Comes in a cotton drawstring bag.",
    categoryPrefix: "Toys & Games > Toys > Building Toys > Stacking Blocks",
    brand: "Little Larch",
    material: "beech wood",
    basePriceCents: 2900,
    weightGrams: 900,
    dimsCm: [20, 20, 10],
    allowedClaims: ["beech wood", "water-based paint", "suitable from 12 months"],
    negatedClaims: [],
    tags: ["blocks", "wooden toy"],
    keywords: ["blocks"],
    de: {
      title: "Stapelklötze aus Holz",
      description:
        "Set aus 24 Stapelklötzen aus Buchenholz, mit Farben auf Wasserbasis gefärbt und mit abgerundeten Kanten geschliffen. Geeignet ab 12 Monaten. Im Baumwollbeutel mit Zugband.",
      category: "Spielzeug & Spiele > Spielzeug > Bauspielzeug > Stapelklötze",
    },
  },
  {
    stem: "PL-RB",
    titleEn: "Plush Rabbit",
    descriptionEn:
      "Soft plush rabbit, 30 cm tall, with embroidered eyes rather than buttons and long floppy ears. Machine washable at 30 °C in a wash bag. Filled with recycled fibre.",
    categoryPrefix: "Toys & Games > Toys > Stuffed Animals",
    brand: "Little Larch",
    material: "polyester plush",
    colours: col(["cream", "CR"], ["grey", "GR"]),
    basePriceCents: 2200,
    weightGrams: 250,
    dimsCm: [30, 15, 12],
    allowedClaims: ["machine washable", "embroidered eyes"],
    negatedClaims: [],
    tags: ["plush", "rabbit", "soft toy"],
    keywords: ["rabbit"],
  },
  {
    stem: "WD-PZ",
    titleEn: "Wooden Puzzle",
    descriptionEn:
      "Chunky 12 pieces farm puzzle cut from birch plywood with a printed guide underneath each piece. The knobs are sized for small hands. Wipe clean with a damp cloth.",
    categoryPrefix: "Toys & Games > Puzzles > Jigsaw Puzzles",
    brand: "Little Larch",
    material: "plywood",
    basePriceCents: 1800,
    weightGrams: 400,
    dimsCm: [30, 22, 2],
    allowedClaims: ["12 pieces", "plywood"],
    negatedClaims: [],
    tags: ["puzzle", "wooden toy"],
    keywords: ["puzzle"],
    fr: {
      title: "Puzzle en bois",
      description:
        "Puzzle de la ferme de 12 pièces épaisses découpées dans du contreplaqué de bouleau, avec un guide imprimé sous chaque pièce. Les boutons sont adaptés aux petites mains. Nettoyer avec un chiffon humide.",
      category: "Jouets & Jeux > Puzzles > Puzzles",
    },
  },
  {
    stem: "KT-KT",
    titleEn: "Kite",
    descriptionEn:
      "Single line diamond kite in ripstop nylon with a 2 m tail and fibreglass spars. Flies in light wind and packs into a sleeve. 30 m line on a winder included.",
    categoryPrefix: "Toys & Games > Outdoor Play Equipment > Kites",
    brand: "Little Larch",
    material: "ripstop nylon",
    colours: col(["red", "RD"], ["blue", "BL"]),
    basePriceCents: 2400,
    weightGrams: 300,
    dimsCm: [80, 60, 2],
    allowedClaims: ["ripstop nylon", "single line"],
    negatedClaims: [],
    tags: ["kite", "outdoor"],
    keywords: ["kite"],
  },
  {
    stem: "TY-TK",
    titleEn: "Toy Truck",
    descriptionEn:
      "Tipper truck in beech wood with rubber wheels that are quiet on wooden floors and a tipping bed that locks upright. Finished with clear water-based lacquer. Small parts: suitable from 3 years.",
    categoryPrefix: "Toys & Games > Toys > Toy Vehicles",
    brand: "Little Larch",
    material: "beech wood",
    notes: "Small parts: suitable from 3 years, not suitable for children under 3.",
    basePriceCents: 3400,
    weightGrams: 700,
    dimsCm: [25, 12, 14],
    allowedClaims: ["rubber wheels", "beech wood"],
    negatedClaims: ["suitable for children under 3"],
    tags: ["truck", "wooden toy"],
    keywords: ["truck"],
  },
  // ----------------------------------------------------- bathroom accessories
  {
    stem: "BB-SD",
    titleEn: "Bamboo Soap Dish",
    descriptionEn:
      "Slatted soap dish in bamboo that drains freely so bars dry between uses. Sealed with a plant-based oil. Rinse under the tap and air dry.",
    categoryPrefix: "Home & Garden > Bathroom Accessories > Soap Dishes & Holders",
    brand: "Bathhouse",
    material: "bamboo",
    basePriceCents: 900,
    weightGrams: 90,
    dimsCm: [12, 8, 2],
    allowedClaims: ["bamboo", "drains freely"],
    negatedClaims: [],
    tags: ["soap dish", "bamboo", "bathroom"],
    keywords: ["soap"],
  },
  {
    stem: "CT-TW",
    titleEn: "Cotton Bath Towel",
    descriptionEn:
      "Bath towel in 550 gsm 100% organic cotton, combed for softness and woven with a flat border for hanging. Machine washable at 60 °C and gets more absorbent after the first wash. Made in Portugal.",
    categoryPrefix: "Home & Garden > Linens & Bedding > Towels > Bath Towels",
    brand: "Bathhouse",
    material: "organic cotton",
    care: "Machine washable at 60 °C; tumble dry low.",
    sizes: cm(["50 x 100 cm", "70 x 140 cm"], [1, 1.9]),
    colours: col(["white", "WH"], ["sage green", "SG"]),
    basePriceCents: 1900,
    weightGrams: 450,
    dimsCm: [100, 50, 1],
    allowedClaims: ["100% organic cotton", "550 gsm", "machine washable"],
    negatedClaims: [],
    tags: ["towel", "cotton", "bathroom"],
    keywords: ["towel"],
    de: {
      title: "Badetuch aus Baumwolle",
      description:
        "Badetuch aus 550 g/m² Bio-Baumwolle, gekämmt für mehr Weichheit und mit flacher Bordüre zum Aufhängen gewebt. Waschbar bei 60 °C, nach der ersten Wäsche noch saugfähiger. Hergestellt in Portugal.",
      category: "Haus & Garten > Heimtextilien > Handtücher > Badetücher",
      care: "Waschmaschine 60 °C; Trockner niedrige Stufe.",
    },
    fr: {
      title: "Serviette de bain en coton",
      description:
        "Serviette de bain en coton biologique 550 g/m², peigné pour plus de douceur et tissé avec une bordure plate pour la suspendre. Lavable en machine à 60 °C, encore plus absorbante après le premier lavage. Fabriquée au Portugal.",
      category: "Maison & Jardin > Linge de maison > Serviettes > Serviettes de bain",
      care: "Lavable en machine à 60 °C ; sèche-linge à basse température.",
    },
  },
  {
    stem: "TB-HL",
    titleEn: "Toothbrush Holder",
    descriptionEn:
      "Stoneware toothbrush holder with four slots and a drainage hole in the base so water does not pool. Glazed inside for easy rinsing. Hand wash.",
    categoryPrefix: "Home & Garden > Bathroom Accessories > Toothbrush Holders",
    brand: "Bathhouse",
    material: "stoneware",
    notes: "Hand wash, not dishwasher-safe.",
    colours: col(["white", "WH"], ["charcoal", "CH"]),
    basePriceCents: 1200,
    weightGrams: 350,
    dimsCm: [8, 8, 11],
    allowedClaims: ["stoneware", "drainage hole"],
    negatedClaims: ["dishwasher-safe"],
    tags: ["toothbrush holder", "bathroom"],
    keywords: ["toothbrush"],
  },
  {
    stem: "SH-CD",
    titleEn: "Shower Caddy",
    descriptionEn:
      "Two-tier shower caddy in rust-resistant coated steel that hangs over the shower head with no drilling. Each shelf holds three bottles and has hooks for razors and loofahs. Adjustable hanger for different pipe angles.",
    categoryPrefix: "Home & Garden > Bathroom Accessories > Shower Caddies",
    brand: "Bathhouse",
    material: "coated steel",
    notes: "Rust-resistant coating, not rust-proof; dry occasionally.",
    basePriceCents: 2600,
    weightGrams: 600,
    dimsCm: [25, 12, 60],
    allowedClaims: ["rust-resistant", "no drilling"],
    negatedClaims: ["rust-proof"],
    tags: ["shower caddy", "bathroom"],
    keywords: ["caddy"],
  },
  {
    stem: "BM-MT",
    titleEn: "Bath Mat",
    descriptionEn:
      "Tufted bath mat in 100% organic cotton with a non-slip backing and a dense 1,800 gsm pile. Machine washable at 40 °C; tumble dry low to keep the backing supple. 50 x 80 cm.",
    categoryPrefix: "Home & Garden > Bathroom Accessories > Bath Mats & Rugs",
    brand: null,
    material: "organic cotton",
    care: "Machine washable at 40 °C; tumble dry low.",
    colours: col(["grey", "GR"], ["blush pink", "BP"], ["navy", "NV"]),
    basePriceCents: 2900,
    weightGrams: 800,
    dimsCm: [80, 50, 2],
    allowedClaims: ["100% organic cotton", "machine washable", "non-slip backing"],
    negatedClaims: [],
    tags: ["bath mat", "cotton", "bathroom"],
    keywords: ["mat"],
  },
];

/** Hex colour per canonical colour label, used for the photo backgrounds. */
export const COLOUR_HEX: Record<string, string> = {
  terracotta: "#c8683f",
  white: "#f1efe9",
  black: "#2b2b2b",
  "sage green": "#9caf88",
  "dark blue": "#1f3a93",
  grey: "#9a9a9a",
  charcoal: "#4a4a4a",
  "blush pink": "#e8b4b8",
  cream: "#f3e6c8",
  natural: "#d9c7a7",
  rust: "#b7410e",
  mustard: "#d4a017",
  "forest green": "#2e5d3a",
  teal: "#2a7f7f",
  ochre: "#cc7722",
  burgundy: "#6b1d2b",
  red: "#c0392b",
  navy: "#1b2a4a",
  blue: "#3b6fd6",
  "natural oak": "#c9a46b",
  "smoked oak": "#6b4f36",
};

/** Hex to use when a product has no colour option; keyed by the material word. */
export const MATERIAL_HEX: Record<string, string> = {
  terracotta: "#c8683f",
  stoneware: "#d8cbb8",
  porcelain: "#ebe9e4",
  linen: "#d9c7a7",
  beeswax: "#e8b94a",
  "soy wax": "#e9d7b7",
  brass: "#c9a227",
  "olive wood": "#b48a5a",
  bamboo: "#d2b97a",
  "stainless steel": "#b9bcc2",
  "cast iron": "#4a4a4a",
  oak: "#c9a46b",
  pine: "#e3c99a",
  rattan: "#c9a46b",
  jute: "#c2a878",
  sisal: "#c2a878",
  plywood: "#dcc39a",
  "beech wood": "#e2c9a0",
  concrete: "#9a9a9a",
};

/** Throws when a template's claims are not actually present in its own text. */
export function validateCatalog(): void {
  const stems = new Set<string>();
  for (const t of CATALOG) {
    if (stems.has(t.stem)) throw new Error(`catalog: duplicate stem ${t.stem}`);
    stems.add(t.stem);
    const corpus = `${t.descriptionEn} ${t.notes ?? ""} ${t.care ?? ""}`.toLowerCase();
    for (const claim of t.allowedClaims) {
      if (claim !== claim.toLowerCase()) throw new Error(`catalog ${t.stem}: claim "${claim}" must be lower-case`);
      if (!corpus.includes(claim)) throw new Error(`catalog ${t.stem}: allowed claim "${claim}" not in text`);
    }
    const notes = (t.notes ?? "").toLowerCase();
    for (const claim of t.negatedClaims) {
      if (!notes.includes(`not ${claim}`)) {
        throw new Error(`catalog ${t.stem}: negated claim "${claim}" is not negated in notes`);
      }
    }
    const variants = (t.sizes?.length ?? 1) * (t.colours?.length ?? 1);
    if (variants > 6) throw new Error(`catalog ${t.stem}: ${variants} variants, keep products at 6 or fewer`);
    for (const c of t.colours ?? []) {
      if (!(c.label in COLOUR_HEX)) throw new Error(`catalog ${t.stem}: colour "${c.label}" has no hex`);
    }
  }
}

export function templateByStem(stem: string): ProductTemplate {
  const t = CATALOG.find((x) => x.stem === stem);
  if (!t) throw new Error(`catalog: unknown stem ${stem}`);
  return t;
}
