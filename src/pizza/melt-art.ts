import { placePieces } from './layout';
import { type Blob, metaballPath } from './metaballs';
import { createRng } from './rng';
import { type Dot, r2, scatterDots } from './art/shapes';
import type { Ellipse } from './base-art';

/** Geometry of the melted mozzarella layer: merged metaball patches, a thicker glossy core, browned spots. */
export interface MeltArt {
  base: string;
  highlight: string;
  browning: Dot[];
  sheen: Ellipse[];
  bubbles: Dot[];
}

const cache = new Map<string, MeltArt>();

export function buildMelt(seed: string, portions: number, sauceR: number): MeltArt {
  const double = portions >= 2;
  const key = `${seed}|${double ? 2 : 1}|${Math.round(sauceR)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rng = createRng(`${seed}|melt`);
  // One portion leaves the sauce showing through in places; two portions melt into an almost continuous blanket.
  const count = double ? 21 : 12;
  const spread = placePieces({ seed, slug: 'melt', count, radius: sauceR - 30, variants: 1, rotation: 'none', scaleJitter: 0 });
  const blobs: Blob[] = spread.map((p) => ({ x: p.x, y: p.y, r: rng.range(double ? 58 : 52, double ? 86 : 78) }));

  const extent = sauceR + 60;
  const bounds = { x0: -extent, y0: -extent, x1: extent, y1: extent };
  const base = metaballPath(blobs, { bounds, cell: 10, threshold: 0.5, smooth: 2 });
  const highlight = metaballPath(
    blobs.map((b) => ({ ...b, r: b.r * 0.95 })),
    { bounds, cell: 10, threshold: 0.95, smooth: 2 },
  );

  const browning: Dot[] = blobs
    .filter((_, i) => i % (double ? 2 : 3) === 0)
    .map((b) => ({ x: r2(b.x + rng.range(-b.r * 0.35, b.r * 0.35)), y: r2(b.y + rng.range(-b.r * 0.35, b.r * 0.35)), r: r2(rng.range(15, 32)) }));

  const sheen: Ellipse[] = Array.from({ length: double ? 14 : 9 }, () => {
    const b = blobs[rng.int(blobs.length)]!;
    return {
      cx: r2(b.x + rng.range(-b.r * 0.5, b.r * 0.5)),
      cy: r2(b.y + rng.range(-b.r * 0.5, b.r * 0.5)),
      rx: r2(rng.range(8, 20)),
      ry: r2(rng.range(3, 6)),
      rot: r2(rng.range(-40, 40)),
    };
  });

  const bubbles = scatterDots(`${seed}|melt-bubbles`, double ? 16 : 10, sauceR - 40, 3, 7);

  const art: MeltArt = { base, highlight, browning, sheen, bubbles };
  if (cache.size > 40) cache.clear();
  cache.set(key, art);
  return art;
}
