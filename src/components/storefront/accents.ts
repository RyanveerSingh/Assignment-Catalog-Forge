/**
 * Headlines mix a grotesk with an italic serif on one or two words. The dictionaries mark those
 * words with asterisks ("nothing *invented*."), so translators move the accent where their
 * language puts it. This splits a string into plain and accented runs; unbalanced asterisks
 * are left as text rather than swallowed.
 */

export interface TextRun {
  text: string;
  accent: boolean;
}

export function splitAccents(text: string): TextRun[] {
  const parts = text.split("*");
  if (parts.length % 2 === 0) return [{ text, accent: false }];
  const runs: TextRun[] = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    runs.push({ text: part, accent: i % 2 === 1 });
  });
  return runs;
}

/** The plain words, for `aria-label`s, `<title>`s and anywhere markup would read as noise. */
export function stripAccents(text: string): string {
  return splitAccents(text)
    .map((r) => r.text)
    .join("");
}
