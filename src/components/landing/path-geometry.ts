export interface PathSize {
  width: number;
  height: number;
}

const GUTTER = 44;
/** Inside the 16 px phone gutter, clear of the text's left edge. */
const MOBILE_X = 7;
/** Vertical distance between bends on wide screens. */
const BEND = 640;

/**
 * One thin line that snakes down the page behind the content, alternating sides at every bend.
 * Cubic curves keep the turns soft; on narrow screens it is a straight rule in the left gutter.
 */
export function buildPath({ width, height }: PathSize, mobile: boolean): string {
  if (mobile) return `M ${MOBILE_X} 0 L ${MOBILE_X} ${height}`;
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
    // Control points sit just under half a step down and up, so each crossing reads as a gentle S.
    d += ` C ${x} ${y + step * 0.45}, ${nextX} ${nextY - step * 0.45}, ${nextX} ${nextY}`;
    x = nextX;
    y = nextY;
  }
  return d;
}
