import { describe, expect, it } from 'vitest';
import type { CartLineInput, PizzaConfig } from '@/domain/cart';
import {
  PriceMismatchError,
  PricingError,
  assertTotalMatches,
  priceCart,
  priceLine,
  toppingPriceCents,
} from '@/domain/pricing';
import type { PricingErrorCode } from '@/domain/pricing';
import { testCatalog } from '../fixtures/catalog';

const pizza = (over: Partial<PizzaConfig> = {}): PizzaConfig => ({
  size: 'media',
  dough: 'classica',
  sauce: 'rossa',
  ingredients: [],
  ...over,
});
const pizzaLine = (over: Partial<PizzaConfig> = {}, quantity = 1, extra: Partial<CartLineInput> = {}): CartLineInput =>
  ({ type: 'pizza', pizza: pizza(over), quantity, ...extra }) as CartLineInput;
const productLine = (slug: string, quantity = 1): CartLineInput => ({ type: 'product', slug, quantity });
const portion = (slug: string, portions = 1) => ({ slug, portions });

function pricingError(fn: () => unknown): PricingError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PricingError) return e;
    throw e;
  }
  throw new Error('expected a PricingError but nothing was thrown');
}
const expectCode = (fn: () => unknown, code: PricingErrorCode, slug?: string) => {
  const err = pricingError(fn);
  expect(err.code).toBe(code);
  if (slug !== undefined) expect(err.slug).toBe(slug);
};

const size = (slug: string) => testCatalog.sizes.find((s) => s.slug === slug)!;
const ing = (slug: string) => testCatalog.ingredients.find((i) => i.slug === slug)!;

describe('toppingPriceCents', () => {
  it('is the list price on a 100% size', () => {
    expect(toppingPriceCents(ing('mozzarella'), size('media'))).toBe(150);
  });

  it('scales down on a smaller size and rounds to 10 cents', () => {
    expect(toppingPriceCents(ing('mozzarella'), size('piccola'))).toBe(120);
    expect(toppingPriceCents(ing('funghi'), size('piccola'))).toBe(100); // 96 -> 100
  });

  it('scales up on a bigger size', () => {
    expect(toppingPriceCents(ing('mozzarella'), size('grande'))).toBe(200); // 195 -> 200
    expect(toppingPriceCents(ing('funghi'), size('grande'))).toBe(160); // 156 -> 160
  });

  it('keeps free ingredients free', () => {
    expect(toppingPriceCents(ing('basilico'), size('grande'))).toBe(0);
  });
});

describe('priceLine: custom pizza', () => {
  it('prices a bare base as size price only', () => {
    const line = priceLine(testCatalog, pizzaLine());
    expect(line.unitPriceCents).toBe(550);
    expect(line.breakdown).toEqual([{ kind: 'base', slug: 'media', cents: 550 }]);
    expect(line.allergens).toEqual(['gluten']);
  });

  it('adds one portion per topping', () => {
    const line = priceLine(testCatalog, pizzaLine({ ingredients: [portion('mozzarella'), portion('funghi')] }));
    expect(line.unitPriceCents).toBe(820);
    expect(line.breakdown).toContainEqual({ kind: 'topping', slug: 'mozzarella', portions: 1, cents: 150 });
    expect(line.breakdown).toContainEqual({ kind: 'topping', slug: 'funghi', portions: 1, cents: 120 });
  });

  it('charges a double portion twice', () => {
    const line = priceLine(testCatalog, pizzaLine({ ingredients: [portion('funghi', 2)] }));
    expect(line.unitPriceCents).toBe(790);
    expect(line.breakdown).toContainEqual({ kind: 'topping', slug: 'funghi', portions: 2, cents: 240 });
  });

  it('uses the size base price and scales topping prices per size', () => {
    expect(priceLine(testCatalog, pizzaLine({ size: 'piccola', ingredients: [portion('mozzarella')] })).unitPriceCents).toBe(570);
    expect(priceLine(testCatalog, pizzaLine({ size: 'grande', ingredients: [portion('mozzarella')] })).unitPriceCents).toBe(900);
    expect(priceLine(testCatalog, pizzaLine({ size: 'grande', ingredients: [portion('funghi', 2)] })).unitPriceCents).toBe(1020);
  });

  it('adds the dough surcharge', () => {
    const line = priceLine(testCatalog, pizzaLine({ dough: 'integrale' }));
    expect(line.unitPriceCents).toBe(650);
    expect(line.breakdown).toContainEqual({ kind: 'dough', slug: 'integrale', cents: 100 });
  });

  it('adds the sauce surcharge', () => {
    const line = priceLine(testCatalog, pizzaLine({ sauce: 'bianca' }));
    expect(line.unitPriceCents).toBe(600);
    expect(line.breakdown).toContainEqual({ kind: 'sauce', slug: 'bianca', cents: 50 });
  });

  it('does not list zero-cost surcharges in the breakdown', () => {
    const line = priceLine(testCatalog, pizzaLine());
    expect(line.breakdown.some((b) => b.kind === 'dough' || b.kind === 'sauce')).toBe(false);
  });

  it('unions allergens of dough, sauce and ingredients, in canonical order', () => {
    const withGluten = priceLine(testCatalog, pizzaLine({ ingredients: [portion('mozzarella'), portion('acciughe')] }));
    expect(withGluten.allergens).toEqual(['gluten', 'fish', 'milk']);
    const glutenFree = priceLine(testCatalog, pizzaLine({ dough: 'senza-glutine', ingredients: [portion('mozzarella')] }));
    expect(glutenFree.allergens).toEqual(['milk']);
  });

  it('multiplies by quantity', () => {
    const line = priceLine(testCatalog, pizzaLine({ ingredients: [portion('mozzarella')] }, 3));
    expect(line.unitPriceCents).toBe(700);
    expect(line.lineTotalCents).toBe(2100);
    expect(line.quantity).toBe(3);
  });

  it('freezes a self-contained snapshot for the order record', () => {
    const line = priceLine(testCatalog, pizzaLine({ ingredients: [portion('basilico'), portion('acciughe', 2)] }));
    expect(line.name).toBe('Pizza personalizzata');
    expect(line.snapshot).toMatchObject({
      type: 'pizza',
      size: { slug: 'media', name: 'Media', diameterCm: 30 },
      dough: { slug: 'classica', name: 'Classica' },
      sauce: { slug: 'rossa', name: 'Rossa' },
      removed: [],
    });
    if (line.snapshot.type !== 'pizza') throw new Error('expected pizza snapshot');
    expect(line.snapshot).not.toHaveProperty('menuSlug'); // keeps the stored JSON clean
    expect(line.snapshot.ingredients).toEqual([
      { slug: 'basilico', name: 'Basilico', category: 'veg', portions: 1, extraPortions: 0, afterBake: true, allergens: [] },
      { slug: 'acciughe', name: 'Acciughe', category: 'fish', portions: 2, extraPortions: 0, afterBake: false, allergens: ['fish'] },
    ]);
  });

  it('accepts a custom name for the generic pizza', () => {
    const line = priceLine(testCatalog, pizzaLine(), { customPizzaName: 'Your pizza' });
    expect(line.name).toBe('Your pizza');
  });

  it('keeps trimmed notes and drops blank ones', () => {
    expect(priceLine(testCatalog, pizzaLine({}, 1, { notes: ' ben cotta ' })).notes).toBe('ben cotta');
    expect(priceLine(testCatalog, pizzaLine({}, 1, { notes: '   ' })).notes).toBeUndefined();
  });
});

describe('priceLine: classic menu pizza', () => {
  const margherita = (over: Partial<PizzaConfig> = {}) =>
    pizzaLine({ menuSlug: 'margherita', ingredients: [portion('mozzarella'), portion('basilico')], ...over });

  it('charges the fixed menu price for the size', () => {
    const line = priceLine(testCatalog, margherita());
    expect(line.name).toBe('Margherita');
    expect(line.unitPriceCents).toBe(650);
    expect(line.breakdown).toEqual([{ kind: 'menu', slug: 'margherita', cents: 650 }]);
    expect(priceLine(testCatalog, margherita({ size: 'grande' })).unitPriceCents).toBe(850);
  });

  it('charges only for portions added beyond the recipe', () => {
    const line = priceLine(
      testCatalog,
      margherita({ ingredients: [portion('mozzarella', 2), portion('basilico'), portion('salame-piccante')] }),
    );
    expect(line.unitPriceCents).toBe(650 + 150 + 200);
    expect(line.breakdown).toContainEqual({ kind: 'topping', slug: 'mozzarella', portions: 1, cents: 150 });
    expect(line.breakdown).toContainEqual({ kind: 'topping', slug: 'salame-piccante', portions: 1, cents: 200 });
    if (line.snapshot.type !== 'pizza') throw new Error('expected pizza snapshot');
    const mozzarella = line.snapshot.ingredients.find((i) => i.slug === 'mozzarella')!;
    expect(mozzarella).toMatchObject({ portions: 2, extraPortions: 1 });
  });

  it('gives no refund for removed ingredients and records them', () => {
    const line = priceLine(testCatalog, margherita({ ingredients: [portion('mozzarella')] }));
    expect(line.unitPriceCents).toBe(650);
    if (line.snapshot.type !== 'pizza') throw new Error('expected pizza snapshot');
    expect(line.snapshot.removed).toEqual([{ slug: 'basilico', name: 'Basilico' }]);
    expect(line.snapshot.menuSlug).toBe('margherita');
    expect(line.snapshot.menuName).toBe('Margherita');
  });

  it('scales extra topping prices by the chosen size', () => {
    const line = priceLine(testCatalog, margherita({ size: 'grande', ingredients: [portion('mozzarella'), portion('basilico'), portion('funghi')] }));
    expect(line.unitPriceCents).toBe(850 + 160);
  });

  it('adds the dough surcharge on top of the menu price', () => {
    expect(priceLine(testCatalog, margherita({ dough: 'integrale' })).unitPriceCents).toBe(750);
  });

  it('charges a sauce surcharge only when the sauce differs from the recipe', () => {
    expect(priceLine(testCatalog, margherita({ sauce: 'rossa' })).unitPriceCents).toBe(650);
    expect(priceLine(testCatalog, margherita({ sauce: 'bianca' })).unitPriceCents).toBe(700);
  });

  it('keeps the breakdown summing to the unit price', () => {
    const line = priceLine(
      testCatalog,
      pizzaLine({
        menuSlug: 'diavola',
        size: 'grande',
        dough: 'integrale',
        sauce: 'bianca',
        ingredients: [portion('mozzarella', 2), portion('salame-piccante'), portion('funghi')],
      }),
    );
    expect(line.unitPriceCents).toBe(1100 + 100 + 50 + 200 + 160);
    expect(line.breakdown.reduce((sum, b) => sum + b.cents, 0)).toBe(line.unitPriceCents);
  });

  it('fails when the menu pizza has no price for the size', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ menuSlug: 'boscaiola', size: 'piccola', ingredients: [portion('funghi')] })), 'NO_SIZE_PRICE', 'boscaiola');
  });

  it('fails for an unknown or sold-out menu pizza', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ menuSlug: 'inventata' })), 'UNKNOWN_MENU_PIZZA', 'inventata');
    expectCode(() => priceLine(testCatalog, pizzaLine({ menuSlug: 'esaurita' })), 'ITEM_UNAVAILABLE', 'esaurita');
  });
});

describe('priceLine: products', () => {
  it('prices price x quantity and carries allergens', () => {
    const cola = priceLine(testCatalog, productLine('cola', 2));
    expect(cola.unitPriceCents).toBe(250);
    expect(cola.lineTotalCents).toBe(500);
    expect(cola.name).toBe('Cola 33cl');
    expect(cola.allergens).toEqual([]);
    expect(priceLine(testCatalog, productLine('tiramisu')).allergens).toEqual(['gluten', 'eggs', 'milk']);
  });

  it('fails for unknown and sold-out products', () => {
    expectCode(() => priceLine(testCatalog, productLine('pizza-gigante')), 'UNKNOWN_PRODUCT', 'pizza-gigante');
    expectCode(() => priceLine(testCatalog, productLine('birra-esaurita')), 'ITEM_UNAVAILABLE', 'birra-esaurita');
  });
});

describe('priceLine: validation', () => {
  it('rejects unknown size, dough, sauce and ingredient', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ size: 'gigante' })), 'UNKNOWN_SIZE', 'gigante');
    expectCode(() => priceLine(testCatalog, pizzaLine({ dough: 'kamut' })), 'UNKNOWN_DOUGH', 'kamut');
    expectCode(() => priceLine(testCatalog, pizzaLine({ sauce: 'curry' })), 'UNKNOWN_SAUCE', 'curry');
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('ananas')] })), 'UNKNOWN_INGREDIENT', 'ananas');
  });

  it('rejects sold-out and hidden ingredients', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('tartufo')] })), 'ITEM_UNAVAILABLE', 'tartufo');
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('ex-ingrediente')] })), 'ITEM_UNAVAILABLE', 'ex-ingrediente');
  });

  it('rejects portions above the ingredient maximum or below one', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('basilico', 2)] })), 'INVALID_PORTIONS', 'basilico');
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('funghi', 0)] })), 'INVALID_PORTIONS', 'funghi');
  });

  it('rejects the same ingredient listed twice', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: [portion('funghi'), portion('funghi')] })), 'DUPLICATE_INGREDIENT', 'funghi');
  });

  it('rejects too many distinct ingredients', () => {
    const many = [portion('mozzarella'), portion('funghi'), portion('acciughe')];
    expectCode(() => priceLine(testCatalog, pizzaLine({ ingredients: many }), { limits: { maxIngredientsPerPizza: 2 } }), 'TOO_MANY_INGREDIENTS');
  });

  it('rejects invalid quantities', () => {
    expectCode(() => priceLine(testCatalog, pizzaLine({}, 0)), 'INVALID_QUANTITY');
    expectCode(() => priceLine(testCatalog, pizzaLine({}, 1.5)), 'INVALID_QUANTITY');
    expectCode(() => priceLine(testCatalog, pizzaLine({}, 21)), 'INVALID_QUANTITY');
  });

  it('rejects an inactive size', () => {
    const catalog = { ...testCatalog, sizes: testCatalog.sizes.map((s) => (s.slug === 'grande' ? { ...s, active: false } : s)) };
    expectCode(() => priceLine(catalog, pizzaLine({ size: 'grande' })), 'ITEM_UNAVAILABLE', 'grande');
  });

  it('rejects a sold-out dough', () => {
    const catalog = { ...testCatalog, doughs: testCatalog.doughs.map((d) => (d.slug === 'integrale' ? { ...d, available: false } : d)) };
    expectCode(() => priceLine(catalog, pizzaLine({ dough: 'integrale' })), 'ITEM_UNAVAILABLE', 'integrale');
  });
});

describe('priceCart', () => {
  it('sums lines into subtotal and total (IVA inclusa, so they match)', () => {
    const cart = priceCart(testCatalog, [
      pizzaLine({ ingredients: [portion('mozzarella')] }, 2), // 700 x 2
      productLine('cola', 3), // 250 x 3
    ]);
    expect(cart.subtotalCents).toBe(1400 + 750);
    expect(cart.totalCents).toBe(cart.subtotalCents);
    expect(cart.lines).toHaveLength(2);
  });

  it('counts only pizzas towards the kitchen capacity', () => {
    const cart = priceCart(testCatalog, [pizzaLine({}, 2), pizzaLine({ size: 'grande' }, 1), productLine('cola', 5)]);
    expect(cart.pizzaCount).toBe(3);
  });

  it('rejects an empty cart and an oversized cart', () => {
    expectCode(() => priceCart(testCatalog, []), 'EMPTY_CART');
    expectCode(() => priceCart(testCatalog, [pizzaLine(), pizzaLine(), pizzaLine()], { limits: { maxLines: 2 } }), 'TOO_MANY_LINES');
  });

  it('is all-or-nothing: one bad line fails the whole cart', () => {
    expectCode(() => priceCart(testCatalog, [pizzaLine(), productLine('birra-esaurita')]), 'ITEM_UNAVAILABLE', 'birra-esaurita');
  });

  it('ignores any price the client tries to smuggle in', () => {
    const tampered = { ...pizzaLine({ ingredients: [portion('mozzarella')] }), unitPriceCents: 1, lineTotalCents: 1, totalCents: 1 };
    const cart = priceCart(testCatalog, [tampered as unknown as CartLineInput]);
    expect(cart.totalCents).toBe(700);
  });

  it('prices every line independently and deterministically', () => {
    const lines = [pizzaLine({ menuSlug: 'diavola', ingredients: [portion('mozzarella'), portion('salame-piccante')] }), productLine('patatine')];
    expect(priceCart(testCatalog, lines)).toEqual(priceCart(testCatalog, lines));
  });
});

describe('assertTotalMatches', () => {
  const cart = () => priceCart(testCatalog, [pizzaLine({ ingredients: [portion('mozzarella')] })]);

  it('passes when the client total equals the computed total', () => {
    expect(() => assertTotalMatches(cart(), 700)).not.toThrow();
  });

  it('throws PRICE_MISMATCH carrying both amounts when they differ', () => {
    try {
      assertTotalMatches(cart(), 100);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PriceMismatchError);
      expect((e as PriceMismatchError).code).toBe('PRICE_MISMATCH');
      expect((e as PriceMismatchError).expectedTotalCents).toBe(100);
      expect((e as PriceMismatchError).computedTotalCents).toBe(700);
    }
  });
});
