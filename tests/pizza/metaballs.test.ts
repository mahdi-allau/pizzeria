import { describe, expect, it } from 'vitest';
import { metaballPath } from '@/pizza/metaballs';

const bounds = { x0: -400, y0: -400, x1: 400, y1: 400 };
const opts = { bounds, cell: 8 };

/** All vertices of every sub-path in an "M x y L x y … Z" string. */
function loops(d: string): Array<Array<{ x: number; y: number }>> {
  return d
    .split('M')
    .filter(Boolean)
    .map((chunk) =>
      chunk
        .replace(/Z/g, '')
        .split('L')
        .map((pair) => pair.trim().split(/[ ,]+/).map(Number))
        .map(([x, y]) => ({ x: x!, y: y! })),
    );
}
const center = (pts: Array<{ x: number; y: number }>) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

describe('metaballPath', () => {
  it('returns an empty path for no blobs', () => {
    expect(metaballPath([], opts)).toBe('');
  });

  it('draws one closed, roughly round outline around a single blob', () => {
    const d = metaballPath([{ x: 0, y: 0, r: 100 }], opts);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const [outline] = loops(d);
    expect(loops(d)).toHaveLength(1);
    const radii = outline!.map((p) => Math.hypot(p.x, p.y));
    expect(Math.min(...radii)).toBeGreaterThan(70);
    expect(Math.max(...radii)).toBeLessThan(150);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(15); // a circle, not a lump
    const c = center(outline!);
    expect(Math.hypot(c.x, c.y)).toBeLessThan(5);
  });

  it('merges overlapping blobs into a single melted shape', () => {
    const d = metaballPath(
      [
        { x: -60, y: 0, r: 90 },
        { x: 60, y: 0, r: 90 },
      ],
      opts,
    );
    expect(loops(d)).toHaveLength(1);
  });

  it('keeps distant blobs as separate islands', () => {
    const d = metaballPath(
      [
        { x: -250, y: 0, r: 60 },
        { x: 250, y: 0, r: 60 },
      ],
      opts,
    );
    expect(loops(d)).toHaveLength(2);
  });

  it('bridges blobs that are close but not touching, like cheese stretching', () => {
    // Radius 80, centres 200 apart: the circles do not touch (gap 40) but their fields add up across the gap.
    const near = metaballPath(
      [
        { x: -100, y: 0, r: 80 },
        { x: 100, y: 0, r: 80 },
      ],
      opts,
    );
    expect(loops(near)).toHaveLength(1);
  });

  it('stays inside the bounds', () => {
    const d = metaballPath([{ x: 300, y: 300, r: 120 }], opts);
    for (const loop of loops(d)) {
      for (const p of loop) {
        expect(p.x).toBeGreaterThanOrEqual(bounds.x0 - 1);
        expect(p.x).toBeLessThanOrEqual(bounds.x1 + 1);
        expect(p.y).toBeGreaterThanOrEqual(bounds.y0 - 1);
        expect(p.y).toBeLessThanOrEqual(bounds.y1 + 1);
      }
    }
  });

  it('is deterministic', () => {
    const blobs = [
      { x: -50, y: 20, r: 80 },
      { x: 70, y: -30, r: 70 },
    ];
    expect(metaballPath(blobs, opts)).toBe(metaballPath(blobs, opts));
  });

  it('a higher threshold shrinks the shape (used for the glossy highlight)', () => {
    const blobs = [{ x: 0, y: 0, r: 100 }];
    const wide = loops(metaballPath(blobs, { ...opts, threshold: 0.3 }))[0]!;
    const tight = loops(metaballPath(blobs, { ...opts, threshold: 0.7 }))[0]!;
    const meanR = (pts: Array<{ x: number; y: number }>) => pts.reduce((s, p) => s + Math.hypot(p.x, p.y), 0) / pts.length;
    expect(meanR(tight)).toBeLessThan(meanR(wide));
  });
});
