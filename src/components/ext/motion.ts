import type { Transition } from "motion/react";

/** One easing for the whole product: quick to leave, soft to arrive, so things feel placed rather than thrown. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * A tween with the house easing. `reduce` is the value of `useReducedMotion()`: when the person asked
 * for less motion the tween collapses to an instant cut, so the final state still renders and nothing moves.
 * Never branch a motion component's `initial` on `reduce` (it is `null` during SSR and would mismatch
 * on hydration); branch the transition instead.
 */
export function settle(reduce: boolean | null, duration: number, delay = 0): Transition {
  return reduce ? { duration: 0, delay: 0 } : { duration, delay, ease: EASE_OUT };
}
