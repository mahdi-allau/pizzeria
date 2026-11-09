import { type AllergenCode, unionAllergens } from './allergens';
import type { CartLineInput, PizzaConfig } from './cart';
import type { Catalog, Ingredient, IngredientCategory, ProductCategory, Size } from './catalog';
import { LIMITS, type Limits } from './limits';
import { addCents, mulCents, roundToStep, scalePct } from './money';

/**
 * The single source of truth for what a cart costs. Pure: takes a catalog snapshot and cart input, returns cents.
 * The browser uses it for the live price; the server re-runs it against the database at checkout and trusts nothing
 * the client says about money.
 */

export type PricingErrorCode =
  | 'UNKNOWN_SIZE'
  | 'UNKNOWN_DOUGH'
  | 'UNKNOWN_SAUCE'
  | 'UNKNOWN_INGREDIENT'
  | 'UNKNOWN_MENU_PIZZA'
  | 'UNKNOWN_PRODUCT'
  | 'ITEM_UNAVAILABLE'
  | 'NO_SIZE_PRICE'
  | 'INVALID_PORTIONS'
  | 'DUPLICATE_INGREDIENT'
  | 'TOO_MANY_INGREDIENTS'
  | 'INVALID_QUANTITY'
  | 'EMPTY_CART'
  | 'TOO_MANY_LINES';

export class PricingError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    message: string,
    /** The offending catalog slug, when there is one (shown to the customer: "X è esaurito"). */
    readonly slug?: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

export class PriceMismatchError extends Error {
  readonly code = 'PRICE_MISMATCH' as const;
  constructor(
    readonly expectedTotalCents: number,
    readonly computedTotalCents: number,
  ) {
    super(`Price mismatch: client expected ${expectedTotalCents}, computed ${computedTotalCents}`);
    this.name = 'PriceMismatchError';
  }
}

export interface PricingOptions {
  limits?: Partial<Limits>;
  /** Name frozen on the order for a from-scratch pizza (default Italian). */
  customPizzaName?: string;
}

export type BreakdownEntry =
  | { kind: 'base' | 'menu' | 'dough' | 'sauce'; slug: string; cents: number }
  | { kind: 'topping'; slug: string; portions: number; cents: number };

export interface SnapshotIngredient {
  slug: string;
  name: string;
  category: IngredientCategory;
  portions: number;
  /** Portions beyond what the classic recipe includes (always 0 on a from-scratch pizza). */
  extraPortions: number;
  afterBake: boolean;
  allergens: AllergenCode[];
}

export interface PizzaSnapshot {
  type: 'pizza';
  menuSlug?: string;
  menuName?: string;
  size: { slug: string; name: string; diameterCm: number };
  dough: { slug: string; name: string };
  sauce: { slug: string; name: string };
  ingredients: SnapshotIngredient[];
  /** Recipe ingredients the customer took off a classic pizza. */
  removed: { slug: string; name: string }[];
}

export interface ProductSnapshot {
  type: 'product';
  slug: string;
  name: string;
  category: ProductCategory;
}

export interface PricedLine {
  type: 'pizza' | 'product';
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Structured price composition; the entries always sum to `unitPriceCents`. */
  breakdown: BreakdownEntry[];
  allergens: AllergenCode[];
  notes?: string;
  /** Frozen description stored on the order so later menu edits never rewrite history. */
  snapshot: PizzaSnapshot | ProductSnapshot;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalCents: number;
  /** IVA inclusa: equal to the subtotal. */
  totalCents: number;
  /** Pizzas only (drinks and sides do not use oven capacity). */
  pizzaCount: number;
}

const DEFAULT_CUSTOM_NAME = 'Pizza personalizzata';

/** Price of one portion of an ingredient on a given size: scaled by the size's percentage, rounded to 10 cents. */
export function toppingPriceCents(ingredient: Pick<Ingredient, 'priceCents'>, size: Pick<Size, 'toppingPricePct'>): number {
  return roundToStep(scalePct(ingredient.priceCents, size.toppingPricePct), 10);
}

type Sluggable = { slug: string };
const bySlug = <T extends Sluggable>(items: readonly T[], slug: string): T | undefined => items.find((item) => item.slug === slug);

function cleanNotes(notes: string | undefined): string | undefined {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : undefined;
}

function pricePizza(
  catalog: Catalog,
  config: PizzaConfig,
  limits: Limits,
  customName: string,
): Omit<PricedLine, 'quantity' | 'lineTotalCents' | 'notes'> {
  const size = bySlug(catalog.sizes, config.size);
  if (!size) throw new PricingError('UNKNOWN_SIZE', `Unknown size: ${config.size}`, config.size);
  if (!size.active) throw new PricingError('ITEM_UNAVAILABLE', `Size not available: ${size.slug}`, size.slug);

  const dough = bySlug(catalog.doughs, config.dough);
  if (!dough) throw new PricingError('UNKNOWN_DOUGH', `Unknown dough: ${config.dough}`, config.dough);
  if (!dough.active || !dough.available) throw new PricingError('ITEM_UNAVAILABLE', `Dough not available: ${dough.slug}`, dough.slug);

  const sauce = bySlug(catalog.sauces, config.sauce);
  if (!sauce) throw new PricingError('UNKNOWN_SAUCE', `Unknown sauce: ${config.sauce}`, config.sauce);
  if (!sauce.active || !sauce.available) throw new PricingError('ITEM_UNAVAILABLE', `Sauce not available: ${sauce.slug}`, sauce.slug);

  if (config.ingredients.length > limits.maxIngredientsPerPizza) {
    throw new PricingError('TOO_MANY_INGREDIENTS', `At most ${limits.maxIngredientsPerPizza} ingredients per pizza`);
  }

  const seen = new Set<string>();
  const chosen = config.ingredients.map(({ slug, portions }) => {
    if (seen.has(slug)) throw new PricingError('DUPLICATE_INGREDIENT', `Ingredient listed twice: ${slug}`, slug);
    seen.add(slug);
    const ingredient = bySlug(catalog.ingredients, slug);
    if (!ingredient) throw new PricingError('UNKNOWN_INGREDIENT', `Unknown ingredient: ${slug}`, slug);
    if (!ingredient.active || !ingredient.available) {
      throw new PricingError('ITEM_UNAVAILABLE', `Ingredient not available: ${slug}`, slug);
    }
    const maxPortions = Math.min(ingredient.maxPortions, limits.maxPortions);
    if (!Number.isInteger(portions) || portions < 1 || portions > maxPortions) {
      throw new PricingError('INVALID_PORTIONS', `Invalid portions for ${slug}: ${String(portions)} (max ${maxPortions})`, slug);
    }
    return { ingredient, portions };
  });

  const menu = config.menuSlug === undefined ? undefined : bySlug(catalog.menuPizzas, config.menuSlug);
  if (config.menuSlug !== undefined) {
    if (!menu) throw new PricingError('UNKNOWN_MENU_PIZZA', `Unknown menu pizza: ${config.menuSlug}`, config.menuSlug);
    if (!menu.active || !menu.available) throw new PricingError('ITEM_UNAVAILABLE', `Menu pizza not available: ${menu.slug}`, menu.slug);
  }

  const included = new Map(menu?.recipe.map((r) => [r.ingredientSlug, r.portions]));
  const breakdown: BreakdownEntry[] = [];

  if (menu) {
    const menuPrice = menu.prices[size.slug];
    if (menuPrice === undefined) {
      throw new PricingError('NO_SIZE_PRICE', `Menu pizza ${menu.slug} is not offered in size ${size.slug}`, menu.slug);
    }
    breakdown.push({ kind: 'menu', slug: menu.slug, cents: menuPrice });
  } else {
    breakdown.push({ kind: 'base', slug: size.slug, cents: size.basePriceCents });
  }

  if (dough.surchargeCents > 0) breakdown.push({ kind: 'dough', slug: dough.slug, cents: dough.surchargeCents });

  const sauceCharged = menu ? sauce.slug !== menu.sauceSlug : true;
  if (sauceCharged && sauce.surchargeCents > 0) breakdown.push({ kind: 'sauce', slug: sauce.slug, cents: sauce.surchargeCents });

  const snapshotIngredients = chosen.map(({ ingredient, portions }) => {
    const extraPortions = menu ? Math.max(0, portions - (included.get(ingredient.slug) ?? 0)) : 0;
    const chargedPortions = menu ? extraPortions : portions;
    const cents = mulCents(toppingPriceCents(ingredient, size), chargedPortions);
    if (cents > 0) breakdown.push({ kind: 'topping', slug: ingredient.slug, portions: chargedPortions, cents });
    return {
      slug: ingredient.slug,
      name: ingredient.name,
      category: ingredient.category,
      portions,
      extraPortions,
      afterBake: ingredient.afterBake,
      allergens: ingredient.allergens,
    };
  });

  const removed = (menu?.recipe ?? [])
    .filter((r) => !seen.has(r.ingredientSlug))
    .map((r) => ({ slug: r.ingredientSlug, name: bySlug(catalog.ingredients, r.ingredientSlug)?.name ?? r.ingredientSlug }));

  const unitPriceCents = addCents(...breakdown.map((b) => b.cents));
  const allergens = unionAllergens(dough.allergens, sauce.allergens, ...chosen.map((c) => c.ingredient.allergens));

  const snapshot: PizzaSnapshot = {
    type: 'pizza',
    ...(menu ? { menuSlug: menu.slug, menuName: menu.name } : {}),
    size: { slug: size.slug, name: size.name, diameterCm: size.diameterCm },
    dough: { slug: dough.slug, name: dough.name },
    sauce: { slug: sauce.slug, name: sauce.name },
    ingredients: snapshotIngredients,
    removed,
  };

  return { type: 'pizza', name: menu ? menu.name : customName, unitPriceCents, breakdown, allergens, snapshot };
}

function priceProduct(catalog: Catalog, slug: string): Omit<PricedLine, 'quantity' | 'lineTotalCents' | 'notes'> {
  const product = bySlug(catalog.products, slug);
  if (!product) throw new PricingError('UNKNOWN_PRODUCT', `Unknown product: ${slug}`, slug);
  if (!product.active || !product.available) throw new PricingError('ITEM_UNAVAILABLE', `Product not available: ${slug}`, slug);
  return {
    type: 'product',
    name: product.name,
    unitPriceCents: product.priceCents,
    breakdown: [],
    allergens: unionAllergens(product.allergens),
    snapshot: { type: 'product', slug: product.slug, name: product.name, category: product.category },
  };
}

export function priceLine(catalog: Catalog, line: CartLineInput, options: PricingOptions = {}): PricedLine {
  const limits: Limits = { ...LIMITS, ...options.limits };
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > limits.maxQuantityPerLine) {
    throw new PricingError('INVALID_QUANTITY', `Quantity must be an integer between 1 and ${limits.maxQuantityPerLine}`);
  }

  const priced =
    line.type === 'product'
      ? priceProduct(catalog, line.slug)
      : pricePizza(catalog, line.pizza, limits, options.customPizzaName ?? DEFAULT_CUSTOM_NAME);

  const notes = cleanNotes(line.notes);
  return {
    ...priced,
    quantity: line.quantity,
    lineTotalCents: mulCents(priced.unitPriceCents, line.quantity),
    ...(notes ? { notes } : {}),
  };
}

export function priceCart(catalog: Catalog, lines: readonly CartLineInput[], options: PricingOptions = {}): PricedCart {
  const limits: Limits = { ...LIMITS, ...options.limits };
  if (lines.length === 0) throw new PricingError('EMPTY_CART', 'The cart is empty');
  if (lines.length > limits.maxLines) throw new PricingError('TOO_MANY_LINES', `At most ${limits.maxLines} lines per order`);

  const priced = lines.map((line) => priceLine(catalog, line, options));
  const subtotalCents = addCents(...priced.map((l) => l.lineTotalCents));
  const pizzaCount = priced.reduce((n, l) => n + (l.type === 'pizza' ? l.quantity : 0), 0);
  return { lines: priced, subtotalCents, totalCents: subtotalCents, pizzaCount };
}

/** Compares the total the customer saw with the one just computed; any difference means prices changed or were tampered with. */
export function assertTotalMatches(cart: Pick<PricedCart, 'totalCents'>, expectedTotalCents: number): void {
  if (cart.totalCents !== expectedTotalCents) throw new PriceMismatchError(expectedTotalCents, cart.totalCents);
}
