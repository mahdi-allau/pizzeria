import { describe, expect, it } from 'vitest';
import type { PizzaSnapshot } from '@/domain/pricing';
import type { OrderEmailItem } from '@/server/email/types';
import { buildItemView, buildOrderView } from '@/server/email/view';
import { itemsFromCart, makeOrder } from './helpers';

const [diavola, margherita, custom, cola] = itemsFromCart([
  {
    type: 'pizza',
    quantity: 2,
    notes: 'ben cotta',
    pizza: {
      menuSlug: 'diavola',
      size: 'media',
      dough: 'integrale',
      sauce: 'rossa',
      ingredients: [
        { slug: 'mozzarella', portions: 2 },
        { slug: 'salame-piccante', portions: 1 },
        { slug: 'funghi', portions: 1 },
      ],
    },
  },
  {
    type: 'pizza',
    quantity: 1,
    pizza: { menuSlug: 'margherita', size: 'piccola', dough: 'classica', sauce: 'rossa', ingredients: [{ slug: 'mozzarella', portions: 1 }] },
  },
  {
    type: 'pizza',
    quantity: 1,
    pizza: {
      size: 'grande',
      dough: 'classica',
      sauce: 'bianca',
      ingredients: [
        { slug: 'mozzarella', portions: 1 },
        { slug: 'acciughe', portions: 1 },
        { slug: 'basilico', portions: 1 },
      ],
    },
  },
  { type: 'product', slug: 'cola', quantity: 2 },
]) as [OrderEmailItem, OrderEmailItem, OrderEmailItem, OrderEmailItem];

describe('buildItemView: a classic pizza the customer changed', () => {
  const view = buildItemView(diavola);

  it('describes size, dough and sauce', () => {
    expect(view).toMatchObject({ kind: 'pizza', quantity: 2, name: 'Diavola', build: 'Media (30 cm), impasto: Integrale, salsa: Rossa' });
  });

  it('marks doubles and extras on the ingredients', () => {
    expect(view.ingredients).toEqual([
      { text: 'Mozzarella ×2 (+1 extra)', extra: true, afterBake: false },
      { text: 'Salame piccante', extra: false, afterBake: false },
      { text: 'Funghi (extra)', extra: true, afterBake: false },
    ]);
  });

  it('is flagged as modified, carries notes, prices and the allergens of every component', () => {
    expect(view.modified).toBe(true);
    expect(view.removed).toEqual([]);
    expect(view.notes).toBe('ben cotta');
    expect(view.unitPrice).toBe('12,20 €');
    expect(view.lineTotal).toBe('24,40 €');
    expect(view.allergens).toEqual(['Glutine', 'Latte']);
  });
});

describe('buildItemView: removed ingredients', () => {
  it('lists what was taken off a classic pizza and flags the pizza as modified', () => {
    const view = buildItemView(margherita);
    expect(view.name).toBe('Margherita');
    expect(view.removed).toEqual(['Basilico']);
    expect(view.modified).toBe(true);
    expect(view.ingredients).toEqual([{ text: 'Mozzarella', extra: false, afterBake: false }]);
  });
});

describe('buildItemView: a pizza built from scratch', () => {
  const view = buildItemView(custom);

  it('keeps the frozen name, is not "modified" and has no extras (everything is chosen)', () => {
    expect(view.name).toBe('Pizza personalizzata');
    expect(view.modified).toBe(false);
    expect(view.ingredients.every((i) => !i.extra)).toBe(true);
  });

  it('hints at ingredients that go on after baking', () => {
    expect(view.ingredients.map((i) => i.text)).toEqual(['Mozzarella', 'Acciughe', 'Basilico (dopo cottura)']);
    expect(view.ingredients[2]).toMatchObject({ afterBake: true });
  });

  it('lists allergens in the order of the regulation', () => {
    expect(view.allergens).toEqual(['Glutine', 'Pesce', 'Latte']);
  });
});

describe('buildItemView: wording edge cases', () => {
  const base: PizzaSnapshot = {
    type: 'pizza',
    menuSlug: 'margherita',
    menuName: 'Margherita',
    size: { slug: 'media', name: 'Media', diameterCm: 30 },
    dough: { slug: 'classica', name: 'Classica' },
    sauce: { slug: 'rossa', name: 'Rossa' },
    ingredients: [],
    removed: [],
  };
  const item = (config: PizzaSnapshot): OrderEmailItem => ({
    name: 'Margherita',
    quantity: 1,
    unitPriceCents: 650,
    lineTotalCents: 650,
    notes: null,
    allergens: [],
    config,
  });

  it('combines double, extra and after-bake on one ingredient', () => {
    const view = buildItemView(
      item({
        ...base,
        ingredients: [{ slug: 'rucola', name: 'Rucola', category: 'veg', portions: 3, extraPortions: 2, afterBake: true, allergens: [] }],
      }),
    );
    expect(view.ingredients[0]!.text).toBe('Rucola ×3 (+2 extra, dopo cottura)');
  });

  it('calls an extra portion "extra" when the whole ingredient was added', () => {
    const view = buildItemView(
      item({
        ...base,
        ingredients: [{ slug: 'funghi', name: 'Funghi', category: 'veg', portions: 2, extraPortions: 2, afterBake: false, allergens: [] }],
      }),
    );
    expect(view.ingredients[0]!.text).toBe('Funghi ×2 (extra)');
  });

  it('says "senza salsa" instead of "salsa: Senza salsa"', () => {
    const view = buildItemView(item({ ...base, sauce: { slug: 'nessuna', name: 'Senza salsa' } }));
    expect(view.build).toBe('Media (30 cm), impasto: Classica, senza salsa');
  });

  it('never drops an allergen it does not recognise', () => {
    const view = buildItemView({ ...item(base), allergens: ['milk', 'kiwi'] });
    expect(view.allergens).toEqual(['Latte', 'kiwi']);
  });

  it('survives a config that is not a snapshot, as a plain line', () => {
    const view = buildItemView({ ...item(base), config: {} as unknown as PizzaSnapshot });
    expect(view).toMatchObject({ kind: 'product', name: 'Margherita', ingredients: [], removed: [], build: null });
  });
});

describe('buildItemView: a drink', () => {
  it('is just a name and a quantity', () => {
    expect(buildItemView(cola)).toMatchObject({
      kind: 'product',
      quantity: 2,
      name: 'Cola 33cl',
      build: null,
      ingredients: [],
      removed: [],
      modified: false,
      allergens: [],
      unitPrice: '2,50 €',
      lineTotal: '5,00 €',
    });
  });
});

describe('buildOrderView', () => {
  const order = makeOrder();
  const view = buildOrderView(order);

  it('counts pizzas, not drinks', () => {
    expect(view.pizzaCount).toBe(4);
    expect(view.items).toHaveLength(4);
  });

  it('merges the allergens of every item into one list', () => {
    expect(view.allergens).toEqual(['Glutine', 'Pesce', 'Latte']);
  });
});
