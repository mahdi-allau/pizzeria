import { describe, expect, it } from 'vitest';
import { resolveInit } from '@/features/builder/init';
import { testCatalog } from '../fixtures/catalog';

const init = (params: Record<string, string | string[] | undefined> = {}) => resolveInit(testCatalog, params, 'seed0001');

describe('resolveInit: a fresh pizza', () => {
  it('defaults to the middle size, the first dough and sauce, and an empty pizza on step 1', () => {
    expect(init()).toEqual({ size: 'media', dough: 'classica', sauce: 'rossa', seed: 'seed0001', items: [], step: 1, notices: [] });
  });

  it('honours valid size and dough choices and ignores invalid ones', () => {
    expect(init({ size: 'grande', dough: 'integrale' })).toMatchObject({ size: 'grande', dough: 'integrale' });
    expect(init({ size: 'gigante', dough: 'kamut' })).toMatchObject({ size: 'media', dough: 'classica' });
  });

  it('skips sizes and doughs that are inactive or sold out', () => {
    const catalog = {
      ...testCatalog,
      sizes: testCatalog.sizes.map((s) => (s.slug === 'media' ? { ...s, active: false } : s)),
      doughs: testCatalog.doughs.map((d) => (d.slug === 'classica' ? { ...d, available: false } : d)),
    };
    const result = resolveInit(catalog, { size: 'media', dough: 'classica' }, 's');
    expect(result.size).not.toBe('media');
    expect(result.dough).toBe('integrale');
  });

  it('opens on step 2 only when asked', () => {
    expect(init({ step: '2' }).step).toBe(2);
    expect(init({ step: '7' }).step).toBe(1);
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(init({ size: ['grande', 'piccola'] }).size).toBe('grande');
  });
});

describe('resolveInit: preloaded toppings (from the home page)', () => {
  it('reads slug:portions pairs in order, defaulting to one portion', () => {
    expect(init({ ing: 'mozzarella:2,funghi' }).items).toEqual([
      { slug: 'mozzarella', portions: 2 },
      { slug: 'funghi', portions: 1 },
    ]);
  });

  it('clamps portions to what the ingredient allows and drops nonsense', () => {
    expect(init({ ing: 'basilico:5,funghi:abc,gorgonzola:0' }).items).toEqual([
      { slug: 'basilico', portions: 1 },
      { slug: 'funghi', portions: 1 },
    ]);
  });

  it('drops unknown ingredients, duplicates and anything beyond the pizza limit', () => {
    expect(init({ ing: 'ananas,funghi,funghi' }).items).toEqual([{ slug: 'funghi', portions: 1 }]);
    const many = Array.from({ length: 40 }, () => 'funghi').join(',');
    expect(init({ ing: many }).items).toHaveLength(1);
  });

  it('removes sold-out and hidden ingredients and tells the customer', () => {
    const result = init({ ing: 'funghi,tartufo,ex-ingrediente' });
    expect(result.items).toEqual([{ slug: 'funghi', portions: 1 }]);
    expect(result.notices).toEqual(['Tartufo non è disponibile oggi e non è stato aggiunto.']);
  });
});

describe('resolveInit: customising a classic', () => {
  it('preloads the recipe, sauce and the classic seed, and opens on the ingredients', () => {
    expect(init({ base: 'diavola' })).toEqual({
      size: 'media',
      dough: 'classica',
      sauce: 'rossa',
      seed: 'diavola',
      menuSlug: 'diavola',
      items: [
        { slug: 'mozzarella', portions: 1 },
        { slug: 'salame-piccante', portions: 1 },
      ],
      step: 2,
      notices: [],
    });
  });

  it('uses the chosen size and dough', () => {
    expect(init({ base: 'margherita', size: 'grande', dough: 'integrale' })).toMatchObject({ size: 'grande', dough: 'integrale', menuSlug: 'margherita' });
  });

  it('can still open on step 1', () => {
    expect(init({ base: 'margherita', step: '1' }).step).toBe(1);
  });

  it('falls back to a fresh pizza for an unknown or sold-out classic', () => {
    expect(init({ base: 'inventata' })).toMatchObject({ items: [], step: 1 });
    expect(init({ base: 'esaurita' })).toMatchObject({ items: [], step: 1 });
    expect(init({ base: 'esaurita' }).menuSlug).toBeUndefined();
  });

  it('falls back to the first size the classic is sold in', () => {
    // "boscaiola" has a price only for the media size
    expect(init({ base: 'boscaiola', size: 'grande' })).toMatchObject({ menuSlug: 'boscaiola', size: 'media' });
  });
});

describe('resolveInit: editing a pizza already in the cart', () => {
  it('passes the cart line id through so the client can load it', () => {
    expect(init({ edit: 'line-123' }).editLineId).toBe('line-123');
  });

  it('ignores an empty or oversized id', () => {
    expect(init({ edit: '' }).editLineId).toBeUndefined();
    expect(init({ edit: 'x'.repeat(200) }).editLineId).toBeUndefined();
  });
});
