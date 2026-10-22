/**
 * CSV delimiter detection (EC-A5). European Excel exports use ";", some tools tab or "|".
 */

export type Delimiter = "," | ";" | "\t" | "|";

/** Candidate order doubles as the tie-break order. */
const CANDIDATES: readonly Delimiter[] = [",", ";", "\t", "|"];
const MAX_RECORDS = 50;

export function detectDelimiter(sample: string): { delimiter: Delimiter; confidence: number } {
  const records = countPerRecord(sample);
  if (records.length === 0) return { delimiter: ",", confidence: 0 };

  let best: { delimiter: Delimiter; consistency: number; mode: number } | null = null;
  for (let ci = 0; ci < CANDIDATES.length; ci++) {
    const counts = records.map((record) => record[ci]);
    const mode = modeOf(counts);
    // A delimiter that is absent from most lines cannot be the separator.
    if (mode === 0) continue;
    const consistency = counts.filter((c) => c === mode).length / counts.length;
    const better =
      best === null ||
      consistency > best.consistency ||
      // Equal consistency: the candidate producing more columns is the structural one; the
      // other is usually punctuation inside free text.
      (consistency === best.consistency && mode > best.mode);
    if (better) best = { delimiter: CANDIDATES[ci], consistency, mode };
  }

  if (best === null) return { delimiter: ",", confidence: 0 };
  return { delimiter: best.delimiter, confidence: Math.round(best.consistency * 100) };
}

/**
 * One pass over the sample, tracking quote state so delimiters inside "…" do not count and a
 * quoted field spanning lines stays one record. Returns per-record counts in CANDIDATES order.
 */
function countPerRecord(sample: string): number[][] {
  const records: number[][] = [];
  let current = [0, 0, 0, 0];
  let hasContent = false;
  let inQuotes = false;

  const flush = (): void => {
    if (hasContent) records.push(current);
    current = [0, 0, 0, 0];
    hasContent = false;
  };

  for (let i = 0; i < sample.length && records.length < MAX_RECORDS; i++) {
    const ch = sample[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasContent = true;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && sample[i + 1] === "\n") i++;
      flush();
      continue;
    }
    if (!inQuotes) {
      const ci = CANDIDATES.indexOf(ch as Delimiter);
      if (ci !== -1) current[ci]++;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") hasContent = true;
  }
  if (records.length < MAX_RECORDS) flush();
  return records;
}

function modeOf(values: number[]): number {
  const freq = new Map<number, number>();
  let mode = 0;
  let modeFreq = 0;
  for (const v of values) {
    const f = (freq.get(v) ?? 0) + 1;
    freq.set(v, f);
    if (f > modeFreq || (f === modeFreq && v > mode)) {
      mode = v;
      modeFreq = f;
    }
  }
  return mode;
}
