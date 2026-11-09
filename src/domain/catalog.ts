import type { AllergenCode } from './allergens';

/**
 * Plain, serialisable catalog types. The same shapes are used by the server (loaded from Postgres),
 * the pricing function, and client components (passed as props). No behaviour lives here.
 */

export type IngredientCategory = 'cheese' | 'cured' | 'veg' | 'fish' | 'extra';
export type ProductCategory = 'drink' | 'side' | 'dessert';

export interface Size {
  slug: string;
  name: string;
  diameterCm: number;
  /** Builder base price: dough + sauce, toppings excluded. */
  basePriceCents: number;
  /** Topping prices are scaled by this integer percentage on this size (100 = list price). */
  toppingPricePct: number;
  sortOrder: number;
  active: boolean;
}

export interface Dough {
  slug: string;
  name: string;
  description: string;
  surchargeCents: number;
  allergens: AllergenCode[];
  sortOrder: number;
  active: boolean;
  /** false = sold out. */
  available: boolean;
}

export interface Sauce {
  slug: string;
  name: string;
  description: string;
  surchargeCents: number;
  allergens: AllergenCode[];
  sortOrder: number;
  active: boolean;
  available: boolean;
}

export interface Ingredient {
  slug: string;
  name: string;
  category: IngredientCategory;
  /** Price of one portion at list price (size scaling applied separately). */
  priceCents: number;
  maxPortions: number;
  allergens: AllergenCode[];
  vegetarian: boolean;
  vegan: boolean;
  spicy: boolean;
  /** Added after baking (rocket, crudo, basil...). Shown on the kitchen ticket and drawn fresher. */
  afterBake: boolean;
  /** false = sold out for now. */
  available: boolean;
  /** false = hidden from the builder entirely. */
  active: boolean;
  sortOrder: number;
}

export interface MenuPizzaIngredient {
  ingredientSlug: string;
  portions: number;
}

export interface MenuPizza {
  slug: string;
  name: string;
  description: string;
  sauceSlug: string;
  badges: string[];
  /** Fixed menu price per size slug. A size without a price is not offered. */
  prices: Record<string, number>;
  recipe: MenuPizzaIngredient[];
  /** Seed for the deterministic topping layout, so a classic always looks the same. */
  seed: string;
  available: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Product {
  slug: string;
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  allergens: AllergenCode[];
  volumeLabel?: string;
  available: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Catalog {
  sizes: Size[];
  doughs: Dough[];
  sauces: Sauce[];
  ingredients: Ingredient[];
  menuPizzas: MenuPizza[];
  products: Product[];
}
