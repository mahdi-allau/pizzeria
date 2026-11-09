import { createRng } from './rng';
import type { RotationMode, ScatterStyle } from './types';

/**
 * Where toppings land. A pure function of (pizza seed, ingredient slug, piece index): the same pizza is drawn
 * identically everywhere, and nothing jumps when the customer changes something else.
 *
 * Each ingredient has its own PREFIX-STABLE sequence: piece n depends only on pieces 0..n-1. So
 *   - adding a portion appends new pieces; the existing ones do not move;
 *   - removing a portion removes the tail;
 *   - changing size (more/fewer pieces) or any other ingredient never moves this one.
 * Within the sequence we use best-candidate sampling (a progressive Poisson-disc): each new piece is the farthest
 * of K random candidates from the pieces already placed, which gives the even, natural look of hand-scattered toppings.
 */

const TAU = Math.PI * 2;

export interface Placement {
  /** 0…n-1, stable across renders: use it as the React key. */
  index: number;
  /** Position relative to the pizza centre, in the same units as `radius`. */
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  scale: number;
  variant: number;
  /** Mirror horizontally to break repetition. */
  flip: boolean;
}

export interface PlaceOptions {
  seed: string;
  slug: string;
  count: number;
  /** Usable radius for piece centres. */
  radius: number;
  variants: number;
  rotation: RotationMode;
  /** ±fraction of random size variation. */
  scaleJitter: number;
  /** Candidates tried per piece (higher = more even, slower). */
  candidates?: number;
}

export function placePieces(options: PlaceOptions): Placement[] {
  const { seed, slug, count, radius, variants, rotation, scaleJitter, candidates = 10 } = options;
  const rng = createRng(`${seed}|${slug}`);
  const placed: Placement[] = [];

  for (let index = 0; index < count; index++) {
    let bestX = 0;
    let bestY = 0;
    let bestScore = -1;

    for (let c = 0; c < candidates; c++) {
      const angle = rng.next() * TAU;
      const r = radius * Math.sqrt(rng.next()); // uniform over the disc's area
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);

      let nearest = Infinity;
      for (const p of placed) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < nearest) nearest = d;
      }
      // Treat the disc's edge like a neighbour (the circle-inversion image of the candidate), so pieces do not
      // pile up along the rim, which is the classic best-candidate bias.
      const mirror = (radius * radius) / Math.max(r, 1e-6) - r;
      const score = Math.min(nearest, mirror * mirror);
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }

    // Always consume the same number of random values per piece, so every prefix is identical whatever the options.
    const rotationDraw = rng.next();
    const scaleDraw = rng.next();
    const variant = rng.int(Math.max(1, variants));
    const flip = rng.next() < 0.5;

    placed.push({
      index,
      x: bestX,
      y: bestY,
      rotation: rotation === 'none' ? 0 : rotation === 'limited' ? (rotationDraw * 2 - 1) * 35 : rotationDraw * 360,
      scale: 1 + (scaleDraw * 2 - 1) * scaleJitter,
      variant,
      flip,
    });
  }
  return placed;
}

const CAP_DISCRETE = 140;
const CAP_SPRINKLE = 180;

/** How many pieces an ingredient needs for `portions` portions on a pizza of `diameterCm`. */
export function pieceCount(art: { density: number; scatter: ScatterStyle }, portions: number, diameterCm: number): number {
  if (portions <= 0) return 0;
  if (art.scatter === 'center' || art.scatter === 'melt' || art.scatter === 'drizzle') return portions;
  const raw = art.density * portions * (diameterCm / 30) ** 2;
  const cap = art.scatter === 'sprinkle' ? CAP_SPRINKLE : CAP_DISCRETE;
  return Math.min(cap, Math.max(1, Math.round(raw)));
}
