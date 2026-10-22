/**
 * Seeded PRNG (mulberry32) for the sample generator.
 *
 * Every random choice in the generator goes through one of these instances so a seed
 * reproduces byte-identical output. Never use Math.random in scripts/lib.
 */

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** New array with the elements of `arr` in a uniformly random order (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[];
  /** Child generator whose stream is a pure function of this seed and `label`. */
  fork(label: string): Prng;
}

/** FNV-1a 32-bit, used to derive child seeds from labels. */
function hashLabel(seed: number, label: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const prng: Prng = {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new Error(`prng.int: invalid range ${min}..${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new Error("prng.pick: empty array");
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p) {
      return next() < p;
    },
    shuffle(arr) {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork(label) {
      return createPrng(hashLabel(seed, label));
    },
  };
  return prng;
}
