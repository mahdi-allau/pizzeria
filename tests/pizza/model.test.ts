import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { PIZZA_RADIUS, doughLook, sauceLook, sauceRadius, unitsPerCm } from '@/pizza/geometry';
import { buildPizzaModel, type PizzaView } from '@/pizza/model';
import type { IngredientArt } from '@/pizza/types';

const noPiece = (() => null) as unknown as () => ReactElement;
const art = (slug: string, over: Partial<IngredientArt> = {}): IngredientArt => ({
  slug,
  sizeCm: 4,
  density: 10,
  scatter: 'discrete',
  layer: 40,
  variants: 3,
  rotation: 'free',
  scaleJitter: 0.1,
  Piece: noPiece,
  ...over,
});

const catalogArt: Record<string, IngredientArt> = {
  mozzarella: art('mozzarella', { scatter: 'melt', layer: 10 }),
  funghi: art('funghi', { layer: 30, density: 12 }),
  salame: art('salame', { layer: 40, sizeCm: 5.5, density: 11 }),
  basilico: art('basilico', { layer: 30, density: 4 }),
  uovo: art('uovo', { scatter: 'center', layer: 60, sizeCm: 8, density: 1 }),
  origano: art('origano', { scatter: 'sprinkle', layer: 65, sizeCm: 0.6, density: 60 }),
  olio: art('olio', { scatter: 'drizzle', layer: 80, density: 1 }),
};
const resolveArt = (slug: string) => catalogArt[slug] ?? art(slug);

const view = (over: Partial<PizzaView> = {}): PizzaView => ({
  diameterCm: 30,
  dough: 'classica',
  sauce: 'rossa',
  seed: 'k3j9x2ab',
  ingredients: [],
  ...over,
});

describe('geometry helpers', () => {
  it('maps real centimetres to drawing units', () => {
    expect(unitsPerCm(30)).toBeCloseTo((2 * PIZZA_RADIUS) / 30);
    expect(unitsPerCm(36)).toBeLessThan(unitsPerCm(24));
  });

  it('gives thicker crust to gluten-free dough and a smaller sauce disc', () => {
    expect(doughLook('senza-glutine').crustWidth).toBeGreaterThan(doughLook('classica').crustWidth);
    expect(sauceRadius(doughLook('senza-glutine').crustWidth)).toBeLessThan(sauceRadius(doughLook('classica').crustWidth));
  });

  it('falls back to sensible looks for unknown dough and sauce slugs', () => {
    expect(doughLook('kamut')).toBe(doughLook('classica'));
    expect(sauceLook('curry')).toBe(sauceLook('rossa'));
    expect(sauceLook('bianca').kind).toBe('white');
    expect(sauceLook('nessuna').kind).toBe('none');
    expect(doughLook('integrale').kind).toBe('wholegrain');
  });
});

describe('buildPizzaModel', () => {
  it('is empty for a bare base', () => {
    const model = buildPizzaModel(view(), resolveArt);
    expect(model.groups).toEqual([]);
    expect(model.melt).toBeNull();
  });

  it('puts the right number of pieces on the pizza, scaling with area and portions', () => {
    const one = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 1 }] }), resolveArt);
    const two = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 2 }] }), resolveArt);
    const big = buildPizzaModel(view({ diameterCm: 36, ingredients: [{ slug: 'funghi', portions: 1 }] }), resolveArt);
    expect(one.groups[0]!.pieces).toHaveLength(12);
    expect(two.groups[0]!.pieces).toHaveLength(24);
    expect(big.groups[0]!.pieces).toHaveLength(17);
  });

  it('keeps existing pieces exactly where they are when a portion is added', () => {
    const one = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 1 }] }), resolveArt);
    const two = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 2 }] }), resolveArt);
    expect(two.groups[0]!.pieces.slice(0, 12)).toEqual(one.groups[0]!.pieces);
  });

  it('does not move an ingredient when another one is added or removed', () => {
    const alone = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 1 }] }), resolveArt);
    const withSalame = buildPizzaModel(
      view({ ingredients: [{ slug: 'salame', portions: 2 }, { slug: 'funghi', portions: 1 }] }),
      resolveArt,
    );
    const funghi = withSalame.groups.find((g) => g.slug === 'funghi')!;
    expect(funghi.pieces).toEqual(alone.groups[0]!.pieces);
  });

  it('keeps pieces on the sauce, clear of the crust', () => {
    const model = buildPizzaModel(
      view({ ingredients: [{ slug: 'salame', portions: 2 }, { slug: 'funghi', portions: 2 }] }),
      resolveArt,
    );
    const limit = sauceRadius(doughLook('classica').crustWidth);
    for (const group of model.groups) {
      for (const p of group.pieces) expect(Math.hypot(p.x, p.y)).toBeLessThan(limit);
    }
  });

  it('draws by layer: veg under salumi, and after-bake items on top of everything', () => {
    const model = buildPizzaModel(
      view({
        ingredients: [
          { slug: 'salame', portions: 1 },
          { slug: 'basilico', portions: 1, afterBake: true },
          { slug: 'funghi', portions: 1 },
        ],
      }),
      resolveArt,
    );
    expect(model.groups.map((g) => g.slug)).toEqual(['funghi', 'salame', 'basilico']);
  });

  it('keeps insertion order inside the same layer (later additions land on top)', () => {
    const model = buildPizzaModel(
      view({ ingredients: [{ slug: 'funghi', portions: 1 }, { slug: 'basilico', portions: 1 }] }),
      resolveArt,
    );
    expect(model.groups.map((g) => g.slug)).toEqual(['funghi', 'basilico']);
    const reversed = buildPizzaModel(
      view({ ingredients: [{ slug: 'basilico', portions: 1 }, { slug: 'funghi', portions: 1 }] }),
      resolveArt,
    );
    expect(reversed.groups.map((g) => g.slug)).toEqual(['basilico', 'funghi']);
  });

  it('turns the melt ingredient into a cheese layer instead of pieces', () => {
    const model = buildPizzaModel(view({ ingredients: [{ slug: 'mozzarella', portions: 2 }, { slug: 'funghi', portions: 1 }] }), resolveArt);
    expect(model.melt).toEqual({ slug: 'mozzarella', portions: 2 });
    expect(model.groups.map((g) => g.slug)).toEqual(['funghi']);
  });

  it('collects drizzles separately', () => {
    const model = buildPizzaModel(view({ ingredients: [{ slug: 'olio', portions: 1, afterBake: true }] }), resolveArt);
    expect(model.groups).toEqual([]);
    expect(model.drizzles).toEqual([{ slug: 'olio', portions: 1 }]);
  });

  it('puts single-piece ingredients near the middle', () => {
    const model = buildPizzaModel(view({ ingredients: [{ slug: 'uovo', portions: 1 }] }), resolveArt);
    const [egg] = model.groups[0]!.pieces;
    expect(model.groups[0]!.pieces).toHaveLength(1);
    expect(Math.hypot(egg!.x, egg!.y)).toBeLessThan(80);
  });

  it('scales pieces by real size: the same salame looks bigger on a smaller pizza', () => {
    const exact = (slug: string) => ({ ...resolveArt(slug), scaleJitter: 0 });
    const small = buildPizzaModel(view({ diameterCm: 24, ingredients: [{ slug: 'salame', portions: 1 }] }), exact);
    const large = buildPizzaModel(view({ diameterCm: 36, ingredients: [{ slug: 'salame', portions: 1 }] }), exact);
    expect(small.groups[0]!.pieces[0]!.scale / large.groups[0]!.pieces[0]!.scale).toBeCloseTo(36 / 24, 2);
  });

  it('gives every piece a stable, unique key', () => {
    const model = buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 2 }, { slug: 'salame', portions: 1 }] }), resolveArt);
    const keys = model.groups.flatMap((g) => g.pieces.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('funghi:0');
  });

  it('ignores ingredients with zero portions', () => {
    expect(buildPizzaModel(view({ ingredients: [{ slug: 'funghi', portions: 0 }] }), resolveArt).groups).toEqual([]);
  });

  it('is deterministic for the same view', () => {
    const v = view({ ingredients: [{ slug: 'funghi', portions: 2 }, { slug: 'salame', portions: 1 }] });
    expect(buildPizzaModel(v, resolveArt)).toEqual(buildPizzaModel(v, resolveArt));
  });
});
