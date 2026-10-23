export interface PathSize {
  width: number;
  height: number;
}

/** A section's content box, in the overlay's own coordinates. */
export interface ContentBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const GUTTER = 44;
/** Inside the 16 px phone gutter, clear of the text's left edge. */
const MOBILE_X = 7;
/** Vertical distance between bends on wide screens when no section layout is known. */
const BEND = 640;
/** A gap shorter than this between two sections is skipped rather than crossed in a squeeze. */
const MIN_GAP = 48;
/** The line never sits closer than this to the edge of the overlay. */
const EDGE = 6;

function snake(width: number, height: number): string {
  const left = GUTTER;
  const right = width - GUTTER;
  const bends = Math.max(1, Math.round(height / BEND));
  const step = height / bends;
  let x = right;
  let y = 0;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < bends; i++) {
    const nextX = x === right ? left : right;
    const nextY = y + step;
    d += ` C ${x} ${y + step * 0.45}, ${nextX} ${nextY - step * 0.45}, ${nextX} ${nextY}`;
    x = nextX;
    y = nextY;
  }
  return d;
}

/**
 * One thin line that runs down the page behind the content. On narrow screens it is a straight rule
 * in the left gutter. On wide screens it runs down a side gutter and only swings across the page in
 * the empty space between sections, so it never strikes through a heading or a paragraph.
 */
export function buildPath({ width, height }: PathSize, mobile: boolean, boxes: readonly ContentBox[] = []): string {
  if (mobile) return `M ${MOBILE_X} 0 L ${MOBILE_X} ${height}`;
  const sorted = boxes.filter((b) => b.bottom > b.top).sort((a, b) => a.top - b.top);
  if (sorted.length === 0) return snake(width, height);

  const minLeft = Math.min(...sorted.map((b) => b.left));
  const maxRight = Math.max(...sorted.map((b) => b.right));
  const left = Math.max(EDGE, Math.min(GUTTER, minLeft / 2));
  const right = width - Math.max(EDGE, Math.min(GUTTER, (width - maxRight) / 2));

  const gaps: Array<[number, number]> = [];
  let cursor = 0;
  for (const b of sorted) {
    if (b.top - cursor >= MIN_GAP) gaps.push([cursor, b.top]);
    cursor = Math.max(cursor, b.bottom);
  }
  if (height - cursor >= MIN_GAP) gaps.push([cursor, height]);

  let x = right;
  let d = `M ${x} 0`;
  let y = 0;
  for (const [top, bottom] of gaps) {
    const nextX = x === right ? left : right;
    const mid = (top + bottom) / 2;
    if (top > y) d += ` L ${x} ${top}`;
    // Vertical control points make each crossing a soft S that stays inside the gap.
    d += ` C ${x} ${mid}, ${nextX} ${mid}, ${nextX} ${bottom}`;
    x = nextX;
    y = bottom;
  }
  if (y < height) d += ` L ${x} ${height}`;
  return d;
}
