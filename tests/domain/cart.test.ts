import { describe, expect, it } from 'vitest';
import { cartLineSchema, cartSchema } from '@/domain/cart';
import { LIMITS } from '@/domain/limits';

const customPizza = {
  type: 'pizza',
  pizza: { size: 'media', dough: 'classica', sauce: 'rossa', ingredients: [{ slug: 'mozzarella', portions: 1 }] },
  quantity: 2,
};

describe('cartLineSchema', () => {
  it('accepts a custom pizza line', () => {
    const parsed = cartLineSchema.parse(customPizza);
    expect(parsed.type).toBe('pizza');
    expect(parsed.quantity).toBe(2);
  });

  it('accepts a classic pizza line carrying its menuSlug', () => {
    const parsed = cartLineSchema.parse({ ...customPizza, pizza: { ...customPizza.pizza, menuSlug: 'margherita' } });
    expect(parsed.type === 'pizza' && parsed.pizza.menuSlug).toBe('margherita');
  });

  it('accepts a product line', () => {
    expect(cartLineSchema.parse({ type: 'product', slug: 'cola', quantity: 1 })).toEqual({
      type: 'product',
      slug: 'cola',
      quantity: 1,
    });
  });

  it('strips client-supplied prices instead of passing them on', () => {
    const parsed = cartLineSchema.parse({ ...customPizza, unitPriceCents: 1, totalCents: 1 });
    expect(parsed).not.toHaveProperty('unitPriceCents');
    expect(parsed).not.toHaveProperty('totalCents');
  });

  it.each([0, -1, 1.5, LIMITS.maxQuantityPerLine + 1])('rejects quantity %s', (quantity) => {
    expect(cartLineSchema.safeParse({ ...customPizza, quantity }).success).toBe(false);
  });

  it.each(['Mozzarella', 'a b', '../x', '', 'x'.repeat(65), 'sl_ug'])('rejects the slug %j', (slug) => {
    const bad = { ...customPizza, pizza: { ...customPizza.pizza, size: slug } };
    expect(cartLineSchema.safeParse(bad).success).toBe(false);
  });

  it.each([0, LIMITS.maxPortions + 1, 1.5])('rejects %s portions', (portions) => {
    const bad = { ...customPizza, pizza: { ...customPizza.pizza, ingredients: [{ slug: 'mozzarella', portions }] } };
    expect(cartLineSchema.safeParse(bad).success).toBe(false);
  });

  it('keeps an optional layout seed so the same pizza is drawn identically everywhere', () => {
    const parsed = cartLineSchema.parse({ ...customPizza, pizza: { ...customPizza.pizza, seed: 'k3j9x2ab' } });
    expect(parsed.type === 'pizza' && parsed.pizza.seed).toBe('k3j9x2ab');
  });

  it.each(['', 'ab', 'UPPERCASE1', 'has space1', '<script>', 'x'.repeat(33)])('rejects the malformed layout seed %j', (seed) => {
    const bad = { ...customPizza, pizza: { ...customPizza.pizza, seed } };
    expect(cartLineSchema.safeParse(bad).success).toBe(false);
  });

  it('trims notes and drops them when blank', () => {
    expect(cartLineSchema.parse({ ...customPizza, notes: '  senza basilico  ' })).toMatchObject({ notes: 'senza basilico' });
    expect(cartLineSchema.parse({ ...customPizza, notes: '   ' })).not.toHaveProperty('notes');
  });

  it('rejects notes longer than the limit', () => {
    const notes = 'x'.repeat(LIMITS.maxNoteLength + 1);
    expect(cartLineSchema.safeParse({ ...customPizza, notes }).success).toBe(false);
  });

  it('rejects an unknown line type', () => {
    expect(cartLineSchema.safeParse({ type: 'delivery', quantity: 1 }).success).toBe(false);
  });
});

describe('cartSchema', () => {
  it('rejects an empty cart', () => {
    expect(cartSchema.safeParse([]).success).toBe(false);
  });

  it('rejects more lines than the limit', () => {
    const lines = Array.from({ length: LIMITS.maxLines + 1 }, () => customPizza);
    expect(cartSchema.safeParse(lines).success).toBe(false);
  });

  it('accepts a normal cart', () => {
    expect(cartSchema.safeParse([customPizza, { type: 'product', slug: 'cola', quantity: 2 }]).success).toBe(true);
  });
});
