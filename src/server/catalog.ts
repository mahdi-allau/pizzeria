import { asc } from 'drizzle-orm';
import type { Db } from '@/db/client';
import * as s from '@/db/schema';
import { unionAllergens } from '@/domain/allergens';
import type { Catalog } from '@/domain/catalog';

const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'it');

/**
 * Loads the complete catalog (sizes, doughs, sauces, ingredients, classic pizzas, products) as plain serialisable data.
 * Allergen codes are validated here: an unknown code makes loading fail loudly rather than silently hide an allergen.
 */
export async function loadCatalog(db: Db): Promise<Catalog> {
  const [sizes, doughs, sauces, ingredients, pizzas, prices, recipes, products] = await Promise.all([
    db.select().from(s.sizes).orderBy(asc(s.sizes.sortOrder)),
    db.select().from(s.doughs).orderBy(asc(s.doughs.sortOrder)),
    db.select().from(s.sauces).orderBy(asc(s.sauces.sortOrder)),
    db.select().from(s.ingredients).orderBy(asc(s.ingredients.sortOrder)),
    db.select().from(s.menuPizzas).orderBy(asc(s.menuPizzas.sortOrder)),
    db.select().from(s.menuPizzaPrices),
    db.select().from(s.menuPizzaIngredients).orderBy(asc(s.menuPizzaIngredients.position)),
    db.select().from(s.products).orderBy(asc(s.products.sortOrder)),
  ]);

  return {
    sizes: sizes
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        diameterCm: r.diameterCm,
        basePriceCents: r.basePriceCents,
        toppingPricePct: r.toppingPricePct,
        sortOrder: r.sortOrder,
        active: r.active,
      }))
      .sort(byOrder),
    doughs: doughs
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        surchargeCents: r.surchargeCents,
        allergens: unionAllergens(r.allergens),
        sortOrder: r.sortOrder,
        active: r.active,
        available: r.available,
      }))
      .sort(byOrder),
    sauces: sauces
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        surchargeCents: r.surchargeCents,
        allergens: unionAllergens(r.allergens),
        sortOrder: r.sortOrder,
        active: r.active,
        available: r.available,
      }))
      .sort(byOrder),
    ingredients: ingredients
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        category: r.category,
        priceCents: r.priceCents,
        maxPortions: r.maxPortions,
        allergens: unionAllergens(r.allergens),
        vegetarian: r.vegetarian,
        vegan: r.vegan,
        spicy: r.spicy,
        afterBake: r.afterBake,
        available: r.available,
        active: r.active,
        sortOrder: r.sortOrder,
      }))
      .sort(byOrder),
    menuPizzas: pizzas
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        sauceSlug: r.sauceSlug,
        badges: r.badges,
        prices: Object.fromEntries(prices.filter((p) => p.pizzaSlug === r.slug).map((p) => [p.sizeSlug, p.priceCents])),
        recipe: recipes
          .filter((x) => x.pizzaSlug === r.slug)
          .map((x) => ({ ingredientSlug: x.ingredientSlug, portions: x.portions })),
        seed: r.seed,
        available: r.available,
        active: r.active,
        sortOrder: r.sortOrder,
      }))
      .sort(byOrder),
    products: products
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        category: r.category,
        priceCents: r.priceCents,
        allergens: unionAllergens(r.allergens),
        ...(r.volumeLabel ? { volumeLabel: r.volumeLabel } : {}),
        available: r.available,
        active: r.active,
        sortOrder: r.sortOrder,
      }))
      .sort(byOrder),
  };
}
