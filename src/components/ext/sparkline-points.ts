/**
 * Maps a short series onto SVG coordinates for an inline sparkline. Pure, so the server can render
 * the polyline and the first paint already carries the real shape.
 */

interface SparklineBox {
  width: number;
  height: number;
  /** Inset so a stroke at the top or bottom edge is not clipped. */
  pad?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Evenly spaced x, y scaled so the largest value touches the top inset and zero sits on the
 * baseline. Negative or non-finite values count as zero (these are counts). A flat series lies
 * along the baseline; a single value is one point mid-width.
 */
export function sparklineCoords(values: ReadonlyArray<number>, { width, height, pad = 1 }: SparklineBox): Array<[number, number]> {
  const n = values.length;
  if (n === 0) return [];
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const max = Math.max(0, ...clean);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = n > 1 ? innerW / (n - 1) : 0;
  return clean.map((v, i) => {
    const x = n > 1 ? pad + i * step : width / 2;
    const y = max > 0 ? pad + innerH - (v / max) * innerH : pad + innerH;
    return [round1(x), round1(y)];
  });
}

/** The `points` attribute of a polyline: `"x,y x,y …"`. */
export function sparklinePoints(values: ReadonlyArray<number>, box: SparklineBox): string {
  return sparklineCoords(values, box)
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

/** The same line closed down to the baseline, for a faint fill under it. Empty for an empty series. */
export function sparklineArea(values: ReadonlyArray<number>, box: SparklineBox): string {
  const pts = sparklineCoords(values, box);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return "";
  const base = box.height - (box.pad ?? 1);
  return [`${first[0]},${base}`, ...pts.map(([x, y]) => `${x},${y}`), `${last[0]},${base}`].join(" ");
}
