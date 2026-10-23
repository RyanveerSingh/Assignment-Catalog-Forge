import type { Transition } from "motion/react";

/** One easing for the whole product: quick to leave, soft to arrive, so things feel placed rather than thrown. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** The spring behind anything that slides into place (the nav pill, the bulk bar): firm, one small settle, no wobble. */
export const SPRING: Transition = { type: "spring", stiffness: 480, damping: 38, mass: 0.8 };

/**
 * A tween with the house easing. `reduce` is the value of `useReducedMotion()`: when the person asked
 * for less motion the tween collapses to an instant cut, so the final state still renders and nothing moves.
 * Never branch a motion component's `initial` on `reduce` (it is `null` during SSR and would mismatch
 * on hydration); branch the transition instead.
 */
export function settle(reduce: boolean | null, duration: number, delay = 0): Transition {
  return reduce ? { duration: 0, delay: 0 } : { duration, delay, ease: EASE_OUT };
}

/** The spring, or an instant cut under reduced motion. */
export function spring(reduce: boolean | null): Transition {
  return reduce ? { duration: 0 } : SPRING;
}

/** Entrance delay for the n-th item of a list, capped so a long list never waits on its tail. */
export function stagger(index: number, step = 0.045, cap = 10): number {
  return Math.min(index, cap) * step;
}
