import type { Catalog, Ingredient, MenuPizza, Product } from '@/domain/catalog';

/**
 * Small, hand-checkable catalog for unit tests. Numbers are chosen so expected totals can be verified on paper.
 * (The realistic Italian menu lives in src/db/seed.)
 */

const ingredient = (over: Partial<Ingredient> & Pick<Ingredient, 'slug' | 'name' | 'category' | 'priceCents'>): Ingredient => ({
  maxPortions: 2,
  allergens: [],
  vegetarian: true,
  vegan: false,
  spicy: false,
  afterBake: false,
  available: true,
  active: true,
  sortOrder: 0,
  ...over,
});

const menuPizza = (over: Partial<MenuPizza> & Pick<MenuPizza, 'slug' | 'name' | 'prices' | 'recipe'>): MenuPizza => ({
  description: '',
  sauceSlug: 'rossa',
  badges: [],
  seed: over.slug,
  available: true,
  active: true,
  sortOrder: 0,
  ...over,
});

const product = (over: Partial<Product> & Pick<Product, 'slug' | 'name' | 'category' | 'priceCents'>): Product => ({
  description: '',
  allergens: [],
  available: true,
  active: true,
  sortOrder: 0,
  ...over,
});

export const testCatalog: Catalog = {
  sizes: [
    { slug: 'piccola', name: 'Piccola', diameterCm: 24, basePriceCents: 450, toppingPricePct: 80, sortOrder: 1, active: true },
    { slug: 'media', name: 'Media', diameterCm: 30, basePriceCents: 550, toppingPricePct: 100, sortOrder: 2, active: true },
    { slug: 'grande', name: 'Grande', diameterCm: 36, basePriceCents: 700, toppingPricePct: 130, sortOrder: 3, active: true },
  ],
  doughs: [
    { slug: 'classica', name: 'Classica', description: '', surchargeCents: 0, allergens: ['gluten'], sortOrder: 1, active: true, available: true },
    { slug: 'integrale', name: 'Integrale', description: '', surchargeCents: 100, allergens: ['gluten'], sortOrder: 2, active: true, available: true },
    { slug: 'senza-glutine', name: 'Senza glutine', description: '', surchargeCents: 250, allergens: [], sortOrder: 3, active: true, available: true },
  ],
  sauces: [
    { slug: 'rossa', name: 'Rossa', description: '', surchargeCents: 0, allergens: [], sortOrder: 1, active: true, available: true },
    { slug: 'bianca', name: 'Bianca', description: '', surchargeCents: 50, allergens: [], sortOrder: 2, active: true, available: true },
    { slug: 'nessuna', name: 'Senza salsa', description: '', surchargeCents: 0, allergens: [], sortOrder: 3, active: true, available: true },
  ],
  ingredients: [
    ingredient({ slug: 'mozzarella', name: 'Mozzarella', category: 'cheese', priceCents: 150, allergens: ['milk'] }),
    ingredient({ slug: 'gorgonzola', name: 'Gorgonzola', category: 'cheese', priceCents: 180, allergens: ['milk'] }),
    ingredient({ slug: 'salame-piccante', name: 'Salame piccante', category: 'cured', priceCents: 200, vegetarian: false, spicy: true }),
    ingredient({ slug: 'funghi', name: 'Funghi', category: 'veg', priceCents: 120, vegan: true }),
    ingredient({ slug: 'basilico', name: 'Basilico', category: 'veg', priceCents: 0, maxPortions: 1, vegan: true, afterBake: true }),
    ingredient({ slug: 'acciughe', name: 'Acciughe', category: 'fish', priceCents: 220, vegetarian: false, allergens: ['fish'] }),
    ingredient({ slug: 'uovo', name: 'Uovo', category: 'extra', priceCents: 150, maxPortions: 1, allergens: ['eggs'] }),
    ingredient({ slug: 'tartufo', name: 'Tartufo', category: 'extra', priceCents: 300, maxPortions: 1, vegan: true, available: false }),
    ingredient({ slug: 'ex-ingrediente', name: 'Ex ingrediente', category: 'veg', priceCents: 100, active: false }),
  ],
  menuPizzas: [
    menuPizza({
      slug: 'margherita',
      name: 'Margherita',
      prices: { piccola: 550, media: 650, grande: 850 },
      recipe: [
        { ingredientSlug: 'mozzarella', portions: 1 },
        { ingredientSlug: 'basilico', portions: 1 },
      ],
    }),
    menuPizza({
      slug: 'diavola',
      name: 'Diavola',
      prices: { piccola: 700, media: 850, grande: 1100 },
      recipe: [
        { ingredientSlug: 'mozzarella', portions: 1 },
        { ingredientSlug: 'salame-piccante', portions: 1 },
      ],
    }),
    menuPizza({ slug: 'marinara', name: 'Marinara', prices: { piccola: 500, media: 600, grande: 800 }, recipe: [] }),
    menuPizza({ slug: 'boscaiola', name: 'Boscaiola', prices: { media: 900 }, recipe: [{ ingredientSlug: 'funghi', portions: 1 }] }),
    menuPizza({ slug: 'esaurita', name: 'Esaurita', prices: { media: 900 }, recipe: [], available: false }),
  ],
  products: [
    product({ slug: 'cola', name: 'Cola 33cl', category: 'drink', priceCents: 250, volumeLabel: '33cl' }),
    product({ slug: 'acqua', name: 'Acqua 50cl', category: 'drink', priceCents: 100 }),
    product({ slug: 'patatine', name: 'Patatine fritte', category: 'side', priceCents: 450 }),
    product({ slug: 'tiramisu', name: 'Tiramisù', category: 'dessert', priceCents: 400, allergens: ['gluten', 'eggs', 'milk'] }),
    product({ slug: 'birra-esaurita', name: 'Birra', category: 'drink', priceCents: 350, available: false }),
  ],
};
