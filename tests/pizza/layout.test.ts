import { describe, expect, it } from 'vitest';
import { pieceCount, placePieces } from '@/pizza/layout';

const base = { seed: 'k3j9x2ab', slug: 'salame-piccante', radius: 330, variants: 3, rotation: 'free', scaleJitter: 0.12 } as const;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('placePieces: stability', () => {
  it('is deterministic: same inputs, same layout', () => {
    expect(placePieces({ ...base, count: 20 })).toEqual(placePieces({ ...base, count: 20 }));
  });

  it('is prefix-stable: adding a portion never moves the pieces already on the pizza', () => {
    const one = placePieces({ ...base, count: 12 });
    const two = placePieces({ ...base, count: 24 });
    expect(two.slice(0, 12)).toEqual(one);
  });

  it('is independent of other ingredients: depends only on seed + slug', () => {
    const a = placePieces({ ...base, count: 10 });
    const b = placePieces({ ...base, count: 10 });
    expect(a).toEqual(b);
    expect(placePieces({ ...base, slug: 'funghi', count: 10 })).not.toEqual(a);
  });

  it('differs per pizza seed so two pizzas in a cart do not look identical', () => {
    expect(placePieces({ ...base, seed: 'other0001', count: 10 })).not.toEqual(placePieces({ ...base, count: 10 }));
  });

  it('numbers pieces 0..n-1 (they double as stable React keys)', () => {
    expect(placePieces({ ...base, count: 5 }).map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('placePieces: geometry', () => {
  it('keeps every piece centre inside the usable radius', () => {
    for (const p of placePieces({ ...base, count: 80 })) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(base.radius + 1e-9);
  });

  it('spreads pieces evenly (blue noise), far better than pure random would', () => {
    const points = placePieces({ ...base, count: 30 });
    let min = Infinity;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) min = Math.min(min, dist(points[i]!, points[j]!));
    const ideal = Math.sqrt((Math.PI * base.radius ** 2) / 30);
    expect(min).toBeGreaterThan(ideal * 0.45);
  });

  it('covers all four quadrants', () => {
    const points = placePieces({ ...base, count: 100 });
    const quadrants = [0, 0, 0, 0];
    for (const p of points) quadrants[(p.x >= 0 ? 1 : 0) + (p.y >= 0 ? 2 : 0)]!++;
    for (const q of quadrants) {
      expect(q).toBeGreaterThan(15);
      expect(q).toBeLessThan(35);
    }
  });

  it('handles zero pieces', () => {
    expect(placePieces({ ...base, count: 0 })).toEqual([]);
  });
});

describe('placePieces: per-piece variation', () => {
  it('picks a variant within range and uses more than one', () => {
    const pieces = placePieces({ ...base, count: 40 });
    expect(pieces.every((p) => Number.isInteger(p.variant) && p.variant >= 0 && p.variant < 3)).toBe(true);
    expect(new Set(pieces.map((p) => p.variant)).size).toBe(3);
  });

  it('keeps scale within the jitter band', () => {
    for (const p of placePieces({ ...base, count: 60 })) {
      expect(p.scale).toBeGreaterThanOrEqual(0.88);
      expect(p.scale).toBeLessThanOrEqual(1.12);
    }
  });

  it('honours the rotation mode', () => {
    expect(placePieces({ ...base, rotation: 'none', count: 20 }).every((p) => p.rotation === 0)).toBe(true);
    const limited = placePieces({ ...base, rotation: 'limited', count: 50 });
    expect(limited.every((p) => Math.abs(p.rotation) <= 35)).toBe(true);
    const free = placePieces({ ...base, rotation: 'free', count: 80 });
    expect(Math.max(...free.map((p) => p.rotation))).toBeGreaterThan(300);
  });

  it('flips some pieces so mirrored silhouettes break repetition', () => {
    const flips = placePieces({ ...base, count: 60 }).filter((p) => p.flip).length;
    expect(flips).toBeGreaterThan(10);
    expect(flips).toBeLessThan(50);
  });
});

describe('pieceCount', () => {
  const art = { density: 12, scatter: 'discrete' as const };

  it('uses density per portion at 30 cm', () => {
    expect(pieceCount(art, 1, 30)).toBe(12);
    expect(pieceCount(art, 2, 30)).toBe(24);
  });

  it('scales with pizza area', () => {
    expect(pieceCount(art, 1, 24)).toBe(8); // 12 * 0.64 = 7.68
    expect(pieceCount(art, 1, 36)).toBe(17); // 12 * 1.44 = 17.28
  });

  it('never returns fewer than one piece for a chosen ingredient', () => {
    expect(pieceCount({ density: 1, scatter: 'discrete' }, 1, 24)).toBe(1);
  });

  it('keeps single-piece scatter styles at one piece per portion', () => {
    expect(pieceCount({ density: 1, scatter: 'center' }, 2, 36)).toBe(2);
  });

  it('caps very dense sprinkles to protect rendering speed', () => {
    expect(pieceCount({ density: 90, scatter: 'sprinkle' }, 3, 36)).toBeLessThanOrEqual(180);
  });

  it('returns zero for zero portions', () => {
    expect(pieceCount(art, 0, 30)).toBe(0);
  });
});
