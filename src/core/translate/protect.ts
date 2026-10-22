/**
 * Placeholder protection for translation (EC-G1, G2, G4).
 * HTML tags, {{placeholders}}, numbers with units, SKUs and glossary terms are swapped for
 * sentinels (⟦1⟧, ⟦2⟧ …) before the text goes to the model and verified on the way back:
 * every sentinel must come back exactly once and the tag order must be unchanged.
 */

export interface ProtectedText {
  text: string;
  tokens: string[];
}

export interface VerifyResult {
  ok: boolean;
  restored: string | null;
  problems: string[];
}

const SENTINEL = (n: number): string => `⟦${n}⟧`;
const SENTINEL_RE = /⟦(\d+)⟧/g;

/** Order matters: longer, more specific patterns first so a glossary term inside a tag is not split. */
function buildPattern(glossary: string[]): RegExp {
  const escaped = glossary
    .filter((g) => g.trim().length > 0)
    .sort((a, b) => b.length - a.length)
    .map((g) => `\\b${g.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const parts = [
    "<[^>]+>", // html tags
    "\\{\\{[^}]*\\}\\}", // {{placeholders}}
    "\\b[A-Z]{2,}[A-Z0-9]*(?:[-_][A-Z0-9]+)+\\b", // SKU-like codes
    "\\d+(?:[.,]\\d+)*\\s?(?:cm|mm|m|in|inch|inches|ft|kg|g|lb|lbs|oz|ml|l|cl|°C|°F|%|x|×)(?![a-z])", // numbers with units
    "\\d+(?:[.,]\\d+)*", // bare numbers, including 1.299,00
    ...escaped,
  ];
  return new RegExp(parts.join("|"), "g");
}

export function protectText(text: string, glossary: string[] = []): ProtectedText {
  const tokens: string[] = [];
  const re = buildPattern(glossary);
  const out = text.replace(re, (match) => {
    tokens.push(match);
    return SENTINEL(tokens.length);
  });
  return { text: out, tokens };
}

export function verifyAndRestore(translated: string, protectedText: ProtectedText): VerifyResult {
  const problems: string[] = [];
  const seen = new Map<number, number>();
  for (const m of translated.matchAll(SENTINEL_RE)) {
    const n = Number(m[1]);
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  for (let i = 1; i <= protectedText.tokens.length; i++) {
    const count = seen.get(i) ?? 0;
    if (count === 0) problems.push(`placeholder ${i} (${protectedText.tokens[i - 1]}) is missing`);
    else if (count > 1) problems.push(`placeholder ${i} appears ${count} times`);
  }
  for (const n of seen.keys()) {
    if (n < 1 || n > protectedText.tokens.length) problems.push(`unexpected placeholder ${n}`);
  }
  if (problems.length > 0) return { ok: false, restored: null, problems };

  const restored = translated.replace(SENTINEL_RE, (_, n: string) => protectedText.tokens[Number(n) - 1] ?? "");
  // Tag sequence must be identical (EC-G4): tags were sentinels, so order equals sentinel order among tag tokens.
  const originalTags = protectedText.tokens.filter((t) => t.startsWith("<"));
  const restoredTags = [...restored.matchAll(/<[^>]+>/g)].map((m) => m[0]);
  if (originalTags.join("\u0000") !== restoredTags.join("\u0000")) {
    return { ok: false, restored: null, problems: ["HTML tag sequence changed"] };
  }
  return { ok: true, restored, problems: [] };
}
