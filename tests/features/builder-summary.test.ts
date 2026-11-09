import { describe, expect, it } from 'vitest';
import type { PizzaConfig } from '@/domain/cart';
import { priceLine } from '@/domain/pricing';
import { removedIngredients, summaryRows } from '@/features/builder/summary';
import { testCatalog } from '../fixtures/catalog';

const price = (pizza: PizzaConfig) => priceLine(testCatalog, { type: 'pizza', pizza, quantity: 1 });
const config = (over: Partial<PizzaConfig>): PizzaConfig => ({ size: 'media', dough: 'classica', sauce: 'rossa', ingredients: [], ...over });

describe('summaryRows', () => {
  it('lists each ingredient with its portions and what it adds to the price', () => {
    const rows = summaryRows(price(config({ ingredients: [{ slug: 'mozzarella', portions: 1 }, { slug: 'funghi', portions: 2 }] })));
    expect(rows).toEqual([
      { slug: 'mozzarella', name: 'Mozzarella', portions: 1, extraPortions: 0, cents: 150, included: false },
      { slug: 'funghi', name: 'Funghi', portions: 2, extraPortions: 0, cents: 240, included: false },
    ]);
  });

  it('shows free ingredients at zero cents', () => {
    const [row] = summaryRows(price(config({ ingredients: [{ slug: 'basilico', portions: 1 }] })));
    expect(row).toMatchObject({ slug: 'basilico', cents: 0, included: false });
  });

  it('marks what a classic already includes and charges only the extras', () => {
    const rows = summaryRows(
      price(config({ menuSlug: 'margherita', ingredients: [{ slug: 'mozzarella', portions: 2 }, { slug: 'basilico', portions: 1 }, { slug: 'funghi', portions: 1 }] })),
    );
    expect(rows.find((r) => r.slug === 'mozzarella')).toMatchObject({ portions: 2, extraPortions: 1, cents: 150, included: true });
    expect(rows.find((r) => r.slug === 'basilico')).toMatchObject({ extraPortions: 0, cents: 0, included: true });
    expect(rows.find((r) => r.slug === 'funghi')).toMatchObject({ extraPortions: 1, cents: 120, included: false });
  });

  it('is empty for a product line', () => {
    expect(summaryRows(priceLine(testCatalog, { type: 'product', slug: 'cola', quantity: 1 }))).toEqual([]);
  });
});

describe('removedIngredients', () => {
  it('names the recipe ingredients taken off a classic', () => {
    expect(removedIngredients(price(config({ menuSlug: 'margherita', ingredients: [{ slug: 'mozzarella', portions: 1 }] })))).toEqual(['Basilico']);
  });

  it('is empty for a from-scratch pizza', () => {
    expect(removedIngredients(price(config({ ingredients: [{ slug: 'mozzarella', portions: 1 }] })))).toEqual([]);
  });
});
