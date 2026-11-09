/**
 * Seeded randomness. NEVER use Math.random() when drawing a pizza: the same seed must give the same pizza on the
 * server, in the browser, on the status page and in the admin.
 */

/** xmur3-style string hash → unsigned 32-bit integer. */
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: tiny, fast, good enough for visual scatter. Integer maths only, so identical in every JS engine. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** An independent stream derived from this seed + label; does not consume this stream. */
  fork(label: string): Rng;
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashString(seed));
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    fork: (label) => createRng(`${seed}/${label}`),
  };
}
