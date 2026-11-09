import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  builderReducer,
  canUndo,
  fromMenuPizza,
  fromPizzaConfig,
  initialState,
  portionsOf,
  toPizzaConfig,
  type BuilderAction,
  type BuilderState,
} from '@/features/builder/state';
import { testCatalog } from '../fixtures/catalog';

const base = { size: 'media', dough: 'classica', sauce: 'rossa', seed: 'abc12345' };
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state);
const cycle = (slug: string, max = 2): BuilderAction => ({ type: 'cycle', slug, max });
const slugs = (s: BuilderState) => s.items.map((i) => i.slug);

describe('initialState', () => {
  it('starts with a bare base, no history and nothing to undo', () => {
    const s = initialState(base);
    expect(s.items).toEqual([]);
    expect(s.past).toEqual([]);
    expect(canUndo(s)).toBe(false);
    expect(s.menuSlug).toBeUndefined();
  });
});

describe('tap cycle: add, double, remove', () => {
  it('goes 1 → 2 → off for an ingredient that allows two portions', () => {
    let s = initialState(base);
    s = run(s, cycle('funghi'));
    expect(portionsOf(s, 'funghi')).toBe(1);
    s = run(s, cycle('funghi'));
    expect(portionsOf(s, 'funghi')).toBe(2);
    s = run(s, cycle('funghi'));
    expect(portionsOf(s, 'funghi')).toBe(0);
    expect(s.items).toEqual([]);
  });

  it('toggles on and off for a single-portion ingredient', () => {
    let s = run(initialState(base), cycle('uovo', 1));
    expect(portionsOf(s, 'uovo')).toBe(1);
    s = run(s, cycle('uovo', 1));
    expect(portionsOf(s, 'uovo')).toBe(0);
  });

  it('keeps insertion order, and a re-added ingredient goes on top', () => {
    let s = run(initialState(base), cycle('mozzarella'), cycle('funghi'), cycle('salame-piccante'));
    expect(slugs(s)).toEqual(['mozzarella', 'funghi', 'salame-piccante']);
    s = run(s, { type: 'remove', slug: 'funghi' }, cycle('funghi'));
    expect(slugs(s)).toEqual(['mozzarella', 'salame-piccante', 'funghi']);
  });

  it('keeps the position when the portions of an existing ingredient change', () => {
    const s = run(initialState(base), cycle('mozzarella'), cycle('funghi'), cycle('mozzarella'));
    expect(slugs(s)).toEqual(['mozzarella', 'funghi']);
    expect(portionsOf(s, 'mozzarella')).toBe(2);
  });
});

describe('increment / decrement / remove', () => {
  it('increment stops at the maximum', () => {
    const s = run(initialState(base), { type: 'increment', slug: 'funghi', max: 2 }, { type: 'increment', slug: 'funghi', max: 2 }, { type: 'increment', slug: 'funghi', max: 2 });
    expect(portionsOf(s, 'funghi')).toBe(2);
  });

  it('decrement removes the ingredient at zero', () => {
    let s = run(initialState(base), { type: 'increment', slug: 'funghi', max: 2 }, { type: 'increment', slug: 'funghi', max: 2 });
    s = run(s, { type: 'decrement', slug: 'funghi' });
    expect(portionsOf(s, 'funghi')).toBe(1);
    s = run(s, { type: 'decrement', slug: 'funghi' });
    expect(slugs(s)).toEqual([]);
  });

  it('ignores changes to an ingredient that is not on the pizza (no phantom history)', () => {
    const s = initialState(base);
    expect(run(s, { type: 'decrement', slug: 'funghi' })).toBe(s);
    expect(run(s, { type: 'remove', slug: 'funghi' })).toBe(s);
  });
});

describe('undo', () => {
  it('restores the previous pizza, step by step', () => {
    let s = run(initialState(base), cycle('mozzarella'), cycle('funghi'), cycle('funghi'));
    expect(portionsOf(s, 'funghi')).toBe(2);
    s = run(s, { type: 'undo' });
    expect(portionsOf(s, 'funghi')).toBe(1);
    s = run(s, { type: 'undo' });
    expect(slugs(s)).toEqual(['mozzarella']);
    s = run(s, { type: 'undo' });
    expect(slugs(s)).toEqual([]);
    expect(canUndo(s)).toBe(false);
  });

  it('is a no-op with nothing to undo', () => {
    const s = initialState(base);
    expect(run(s, { type: 'undo' })).toBe(s);
  });

  it('also undoes base changes, and keeps the toppings it had', () => {
    let s = run(initialState(base), cycle('mozzarella'), { type: 'setBase', field: 'size', value: 'grande' });
    expect(s.size).toBe('grande');
    s = run(s, { type: 'undo' });
    expect(s.size).toBe('media');
    expect(slugs(s)).toEqual(['mozzarella']);
  });

  it('keeps at most HISTORY_LIMIT steps, dropping the oldest', () => {
    let s = initialState(base);
    for (let i = 0; i < HISTORY_LIMIT + 15; i++) s = run(s, cycle('funghi'));
    expect(s.past.length).toBe(HISTORY_LIMIT);
  });

  it('never mutates earlier states', () => {
    const a = run(initialState(base), cycle('mozzarella'));
    const frozen = JSON.stringify(a);
    run(a, cycle('funghi'), { type: 'undo' }, { type: 'clear' });
    expect(JSON.stringify(a)).toBe(frozen);
  });
});

describe('base choices', () => {
  it('changes size, dough and sauce independently', () => {
    const s = run(initialState(base), { type: 'setBase', field: 'dough', value: 'integrale' }, { type: 'setBase', field: 'sauce', value: 'bianca' });
    expect(s).toMatchObject({ size: 'media', dough: 'integrale', sauce: 'bianca' });
  });

  it('does nothing (and adds no history) when the value is unchanged', () => {
    const s = initialState(base);
    expect(run(s, { type: 'setBase', field: 'size', value: 'media' })).toBe(s);
  });
});

describe('clear', () => {
  it('empties the pizza but can be undone', () => {
    let s = run(initialState(base), cycle('mozzarella'), cycle('funghi'));
    s = run(s, { type: 'clear' });
    expect(s.items).toEqual([]);
    s = run(s, { type: 'undo' });
    expect(slugs(s)).toEqual(['mozzarella', 'funghi']);
  });

  it('is a no-op on an empty pizza', () => {
    const s = initialState(base);
    expect(run(s, { type: 'clear' })).toBe(s);
  });
});

describe('conversion to and from a pizza config', () => {
  it('exports exactly what the server needs, with the seed', () => {
    const s = run(initialState(base), cycle('mozzarella'), cycle('funghi'), cycle('funghi'));
    expect(toPizzaConfig(s)).toEqual({
      size: 'media',
      dough: 'classica',
      sauce: 'rossa',
      seed: 'abc12345',
      ingredients: [
        { slug: 'mozzarella', portions: 1 },
        { slug: 'funghi', portions: 2 },
      ],
    });
  });

  it('carries the classic pizza it started from', () => {
    const s = fromMenuPizza(testCatalog.menuPizzas.find((p) => p.slug === 'diavola')!, { size: 'grande', dough: 'integrale' });
    expect(toPizzaConfig(s)).toMatchObject({ menuSlug: 'diavola', size: 'grande', dough: 'integrale', sauce: 'rossa' });
  });

  it('preloads a classic with its recipe, in recipe order, using the classic seed', () => {
    const s = fromMenuPizza(testCatalog.menuPizzas.find((p) => p.slug === 'margherita')!, { size: 'media', dough: 'classica' });
    expect(s.items).toEqual([
      { slug: 'mozzarella', portions: 1 },
      { slug: 'basilico', portions: 1 },
    ]);
    expect(s.seed).toBe('margherita');
    expect(s.menuSlug).toBe('margherita');
    expect(canUndo(s)).toBe(false);
  });

  it('round-trips a saved cart pizza (so "Personalizza" edits what was ordered)', () => {
    const original = toPizzaConfig(run(initialState(base), cycle('mozzarella'), cycle('acciughe')));
    expect(toPizzaConfig(fromPizzaConfig(original, 'fallbackseed'))).toEqual(original);
  });

  it('falls back to the given seed when the saved pizza has none', () => {
    const s = fromPizzaConfig({ size: 'media', dough: 'classica', sauce: 'rossa', ingredients: [] }, 'fallbackseed');
    expect(s.seed).toBe('fallbackseed');
  });
});
