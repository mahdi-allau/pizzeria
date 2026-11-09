import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '@/pizza/rng';

describe('hashString', () => {
  it('is deterministic and spreads different strings apart', () => {
    expect(hashString('margherita')).toBe(hashString('margherita'));
    expect(hashString('margherita')).not.toBe(hashString('marinara'));
    expect(hashString('')).toBeTypeOf('number');
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['a', 'pepperoni', 'x'.repeat(500)]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-2');
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = createRng('uniform');
    const values = Array.from({ length: 10_000 }, () => rng.next());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('range(a, b) stays inside [a, b)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it('int(n) returns integers in [0, n) and eventually hits every value', () => {
    const rng = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });

  it('pick() returns members of the array', () => {
    const rng = createRng('pick');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
  });

  it('fork() gives an independent stream that does not disturb the parent', () => {
    const parent = createRng('parent');
    const expected = createRng('parent');
    const child = parent.fork('child');
    child.next();
    child.next();
    expect(parent.next()).toBe(expected.next());
    expect(createRng('parent').fork('child').next()).toBe(createRng('parent').fork('child').next());
    expect(createRng('parent').fork('child').next()).not.toBe(createRng('parent').fork('other').next());
  });
});
