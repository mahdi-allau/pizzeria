import type { PizzaConfig } from '@/domain/cart';
import type { MenuPizza } from '@/domain/catalog';

/**
 * Pure state of the pizza builder (no React). Every change that the customer can take back is snapshotted, so
 * "Annulla" restores exactly the previous pizza: base choices and toppings, in order.
 *
 * Order matters: ingredients are kept in the order they were added, and within the same layer the latest addition is
 * drawn on top (see pizza/model.ts).
 */

export const HISTORY_LIMIT = 40;

export interface BuilderItem {
  slug: string;
  portions: number;
}

export interface BuilderBase {
  size: string;
  dough: string;
  sauce: string;
}

export interface BuilderSnapshot extends BuilderBase {
  items: BuilderItem[];
}

export interface BuilderState extends BuilderSnapshot {
  /** The classic pizza this one started from ("Personalizza"): it sets the price basis. */
  menuSlug?: string;
  /** Layout seed: the same pizza is drawn identically everywhere (builder, cart, status page, kitchen). */
  seed: string;
  past: BuilderSnapshot[];
}

export type BuilderAction =
  | { type: 'setBase'; field: keyof BuilderBase; value: string }
  /** Tap on an ingredient: add → extra portion → remove (`max` is the ingredient's maximum portions). */
  | { type: 'cycle'; slug: string; max: number }
  | { type: 'increment'; slug: string; max: number }
  | { type: 'decrement'; slug: string }
  | { type: 'remove'; slug: string }
  | { type: 'clear' }
  | { type: 'undo' };

export function initialState(init: BuilderBase & { seed: string; menuSlug?: string; items?: BuilderItem[] }): BuilderState {
  return {
    size: init.size,
    dough: init.dough,
    sauce: init.sauce,
    items: init.items ?? [],
    seed: init.seed,
    ...(init.menuSlug ? { menuSlug: init.menuSlug } : {}),
    past: [],
  };
}

export const portionsOf = (state: BuilderSnapshot, slug: string): number => state.items.find((i) => i.slug === slug)?.portions ?? 0;
export const canUndo = (state: BuilderState): boolean => state.past.length > 0;

const snapshotOf = (s: BuilderState): BuilderSnapshot => ({ size: s.size, dough: s.dough, sauce: s.sauce, items: s.items });

/** Applies `next` and records the current pizza so it can be undone. Never mutates: arrays are always replaced. */
function commit(s: BuilderState, next: Partial<BuilderSnapshot>): BuilderState {
  return { ...s, ...next, past: [...s.past, snapshotOf(s)].slice(-HISTORY_LIMIT) };
}

function withPortions(s: BuilderState, slug: string, portions: number): BuilderState {
  if (portions <= 0) return commit(s, { items: s.items.filter((i) => i.slug !== slug) });
  const exists = s.items.some((i) => i.slug === slug);
  return commit(s, {
    items: exists ? s.items.map((i) => (i.slug === slug ? { ...i, portions } : i)) : [...s.items, { slug, portions }],
  });
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'setBase':
      return state[action.field] === action.value ? state : commit(state, { [action.field]: action.value });

    case 'cycle': {
      const current = portionsOf(state, action.slug);
      return withPortions(state, action.slug, current >= action.max ? 0 : current + 1);
    }
    case 'increment': {
      const current = portionsOf(state, action.slug);
      return current >= action.max ? state : withPortions(state, action.slug, current + 1);
    }
    case 'decrement': {
      const current = portionsOf(state, action.slug);
      return current === 0 ? state : withPortions(state, action.slug, current - 1);
    }
    case 'remove':
      return portionsOf(state, action.slug) === 0 ? state : withPortions(state, action.slug, 0);

    case 'clear':
      return state.items.length === 0 ? state : commit(state, { items: [] });

    case 'undo': {
      const previous = state.past.at(-1);
      return previous ? { ...state, ...previous, past: state.past.slice(0, -1) } : state;
    }
  }
}

/** What goes into the cart / to the server: choices only, never prices. */
export function toPizzaConfig(state: BuilderState): PizzaConfig {
  return {
    ...(state.menuSlug ? { menuSlug: state.menuSlug } : {}),
    size: state.size,
    dough: state.dough,
    sauce: state.sauce,
    seed: state.seed,
    ingredients: state.items.map((i) => ({ slug: i.slug, portions: i.portions })),
  };
}

/** "Personalizza" on a classic: start from its recipe, sauce and seed. */
export function fromMenuPizza(menu: MenuPizza, options: { size: string; dough: string }): BuilderState {
  return initialState({
    size: options.size,
    dough: options.dough,
    sauce: menu.sauceSlug,
    seed: menu.seed,
    menuSlug: menu.slug,
    items: menu.recipe.map((r) => ({ slug: r.ingredientSlug, portions: r.portions })),
  });
}

/** Edit a pizza already in the cart. */
export function fromPizzaConfig(config: PizzaConfig, fallbackSeed: string): BuilderState {
  return initialState({
    size: config.size,
    dough: config.dough,
    sauce: config.sauce,
    seed: config.seed ?? fallbackSeed,
    ...(config.menuSlug ? { menuSlug: config.menuSlug } : {}),
    items: config.ingredients.map((i) => ({ slug: i.slug, portions: i.portions })),
  });
}
