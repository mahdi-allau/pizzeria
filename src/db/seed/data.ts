import type { Dough, Ingredient, MenuPizza, Product, Sauce, Size } from '../../domain/catalog';

/**
 * Realistic Italian starter catalog.
 *
 * ⚠ PLACEHOLDER DATA. Names, prices and especially ALLERGENS are typical commercial values chosen to be
 * conservative; the pizzeria MUST verify every allergen against its actual suppliers' labels (Reg. UE 1169/2011)
 * and set real prices in /admin/menu before going live.
 */

export const sizes: Size[] = [
  { slug: 'piccola', name: 'Piccola', diameterCm: 24, basePriceCents: 450, toppingPricePct: 80, sortOrder: 1, active: true },
  { slug: 'media', name: 'Media', diameterCm: 30, basePriceCents: 550, toppingPricePct: 100, sortOrder: 2, active: true },
  { slug: 'grande', name: 'Grande', diameterCm: 36, basePriceCents: 700, toppingPricePct: 130, sortOrder: 3, active: true },
];

export const doughs: Dough[] = [
  {
    slug: 'classica',
    name: 'Classica',
    description: 'Impasto a lunga lievitazione, alveolato e leggero.',
    surchargeCents: 0,
    allergens: ['gluten'],
    sortOrder: 1,
    active: true,
    available: true,
  },
  {
    slug: 'integrale',
    name: 'Integrale',
    description: 'Farina integrale macinata a pietra, più rustica e saporita.',
    surchargeCents: 100,
    allergens: ['gluten'],
    sortOrder: 2,
    active: true,
    available: true,
  },
  {
    slug: 'senza-glutine',
    name: 'Senza glutine',
    description: 'Preparata con farine certificate senza glutine.',
    surchargeCents: 250,
    allergens: [],
    sortOrder: 3,
    active: true,
    available: true,
  },
];

export const sauces: Sauce[] = [
  { slug: 'rossa', name: 'Rossa', description: 'Pomodoro pelato, olio extravergine e sale.', surchargeCents: 0, allergens: [], sortOrder: 1, active: true, available: true },
  { slug: 'bianca', name: 'Bianca', description: 'Olio extravergine, aglio e rosmarino.', surchargeCents: 0, allergens: [], sortOrder: 2, active: true, available: true },
  { slug: 'nessuna', name: 'Senza salsa', description: 'Solo impasto, per partire da zero.', surchargeCents: 0, allergens: [], sortOrder: 3, active: true, available: true },
];

type IngredientSeed = Omit<Ingredient, 'sortOrder' | 'active' | 'available'> & Partial<Pick<Ingredient, 'available'>>;

const ing = (
  slug: string,
  name: string,
  category: Ingredient['category'],
  priceCents: number,
  o: Partial<Omit<IngredientSeed, 'slug' | 'name' | 'category' | 'priceCents'>> = {},
): IngredientSeed => ({
  slug,
  name,
  category,
  priceCents,
  maxPortions: 2,
  allergens: [],
  vegetarian: false,
  vegan: false,
  spicy: false,
  afterBake: false,
  ...o,
});

const veg = { vegetarian: true } as const;
const vegan = { vegetarian: true, vegan: true } as const;

const ingredientSeeds: IngredientSeed[] = [
  // Formaggi
  ing('mozzarella', 'Mozzarella fior di latte', 'cheese', 150, { ...veg, allergens: ['milk'] }),
  ing('bufala', 'Mozzarella di bufala', 'cheese', 250, { ...veg, allergens: ['milk'] }),
  ing('gorgonzola', 'Gorgonzola', 'cheese', 180, { ...veg, allergens: ['milk'] }),
  ing('provola', 'Provola affumicata', 'cheese', 180, { ...veg, allergens: ['milk'] }),
  ing('parmigiano', 'Parmigiano Reggiano', 'cheese', 150, { ...veg, allergens: ['milk'], afterBake: true }),
  ing('burrata', 'Burrata', 'cheese', 300, { ...veg, allergens: ['milk'], maxPortions: 1, afterBake: true }),
  // Salumi
  ing('salame-piccante', 'Salame piccante', 'cured', 200, { spicy: true }),
  ing('prosciutto-cotto', 'Prosciutto cotto', 'cured', 180),
  ing('prosciutto-crudo', 'Prosciutto crudo', 'cured', 250, { afterBake: true }),
  ing('speck', 'Speck', 'cured', 220),
  ing('salsiccia', 'Salsiccia', 'cured', 200, { allergens: ['sulphites'] }),
  ing('wurstel', 'Wurstel', 'cured', 150, { allergens: ['milk'] }),
  ing('mortadella', 'Mortadella', 'cured', 220, { allergens: ['milk', 'nuts'] }),
  // Verdure
  ing('funghi', 'Funghi champignon', 'veg', 120, vegan),
  ing('olive-nere', 'Olive nere', 'veg', 100, vegan),
  ing('peperoni', 'Peperoni', 'veg', 120, vegan),
  ing('cipolla', 'Cipolla rossa', 'veg', 100, vegan),
  ing('melanzane', 'Melanzane grigliate', 'veg', 130, vegan),
  ing('zucchine', 'Zucchine', 'veg', 120, vegan),
  ing('carciofi', 'Carciofi', 'veg', 150, vegan),
  ing('pomodorini', 'Pomodorini', 'veg', 120, vegan),
  ing('rucola', 'Rucola', 'veg', 100, { ...vegan, afterBake: true }),
  ing('spinaci', 'Spinaci', 'veg', 120, vegan),
  ing('mais', 'Mais', 'veg', 100, vegan),
  ing('patatine', 'Patatine fritte', 'veg', 130, vegan),
  ing('basilico', 'Basilico fresco', 'veg', 0, { ...vegan, maxPortions: 1, afterBake: true }),
  // Pesce
  ing('acciughe', 'Acciughe', 'fish', 200, { allergens: ['fish'] }),
  ing('tonno', 'Tonno', 'fish', 220, { allergens: ['fish'] }),
  ing('gamberetti', 'Gamberetti', 'fish', 300, { allergens: ['crustaceans'] }),
  ing('cozze', 'Cozze', 'fish', 280, { allergens: ['molluscs'] }),
  ing('salmone', 'Salmone affumicato', 'fish', 320, { allergens: ['fish'], afterBake: true }),
  // Extra
  ing('uovo', 'Uovo', 'extra', 150, { ...veg, allergens: ['eggs'], maxPortions: 1 }),
  ing('origano', 'Origano', 'extra', 0, { ...vegan, maxPortions: 1 }),
  ing('peperoncino', 'Peperoncino', 'extra', 50, { ...vegan, spicy: true }),
  ing('olio-evo', 'Olio extravergine a crudo', 'extra', 50, { ...vegan, maxPortions: 1, afterBake: true }),
  ing('pistacchio', 'Granella di pistacchio', 'extra', 200, { ...veg, allergens: ['nuts'], maxPortions: 1, afterBake: true }),
  ing('tartufo', 'Crema di tartufo', 'extra', 300, { ...veg, maxPortions: 1, afterBake: true }),
];

export const ingredients: Ingredient[] = ingredientSeeds.map((seed, index) => ({
  ...seed,
  available: seed.available ?? true,
  active: true,
  sortOrder: index + 1,
}));

type PizzaSeed = {
  slug: string;
  name: string;
  description: string;
  sauce: 'rossa' | 'bianca';
  prices: [piccola: number, media: number, grande: number];
  recipe: string[];
  badges?: string[];
};

const pizzaSeeds: PizzaSeed[] = [
  { slug: 'margherita', name: 'Margherita', description: 'Pomodoro, mozzarella fior di latte e basilico fresco. Il classico dei classici.', sauce: 'rossa', prices: [550, 650, 850], recipe: ['mozzarella', 'basilico'], badges: ['vegetariana', 'bestseller'] },
  { slug: 'marinara', name: 'Marinara', description: 'Pomodoro, origano e olio extravergine. Niente formaggio, tutta la semplicità napoletana.', sauce: 'rossa', prices: [500, 600, 800], recipe: ['origano'], badges: ['vegana'] },
  { slug: 'diavola', name: 'Diavola', description: 'Pomodoro, mozzarella e salame piccante. Per chi ama il fuoco.', sauce: 'rossa', prices: [700, 850, 1100], recipe: ['mozzarella', 'salame-piccante'], badges: ['piccante', 'bestseller'] },
  { slug: 'napoli', name: 'Napoli', description: 'Pomodoro, mozzarella, acciughe e origano.', sauce: 'rossa', prices: [700, 850, 1100], recipe: ['mozzarella', 'acciughe', 'origano'] },
  { slug: 'quattro-formaggi', name: 'Quattro Formaggi', description: 'Base bianca con mozzarella, gorgonzola, provola affumicata e parmigiano.', sauce: 'bianca', prices: [800, 950, 1250], recipe: ['mozzarella', 'gorgonzola', 'provola', 'parmigiano'], badges: ['vegetariana'] },
  { slug: 'capricciosa', name: 'Capricciosa', description: 'Pomodoro, mozzarella, prosciutto cotto, funghi, carciofi e olive nere.', sauce: 'rossa', prices: [800, 950, 1250], recipe: ['mozzarella', 'prosciutto-cotto', 'funghi', 'carciofi', 'olive-nere'] },
  { slug: 'prosciutto-e-funghi', name: 'Prosciutto e Funghi', description: 'Pomodoro, mozzarella, prosciutto cotto e funghi champignon.', sauce: 'rossa', prices: [750, 900, 1200], recipe: ['mozzarella', 'prosciutto-cotto', 'funghi'] },
  { slug: 'ortolana', name: 'Ortolana', description: 'Pomodoro, mozzarella, zucchine, melanzane grigliate e peperoni.', sauce: 'rossa', prices: [750, 900, 1200], recipe: ['mozzarella', 'zucchine', 'melanzane', 'peperoni'], badges: ['vegetariana'] },
  { slug: 'bufala', name: 'Bufala', description: 'Pomodoro, mozzarella di bufala, pomodorini e basilico.', sauce: 'rossa', prices: [850, 1000, 1300], recipe: ['bufala', 'pomodorini', 'basilico'], badges: ['vegetariana'] },
  { slug: 'boscaiola', name: 'Boscaiola', description: 'Pomodoro, mozzarella, salsiccia e funghi.', sauce: 'rossa', prices: [800, 950, 1250], recipe: ['mozzarella', 'salsiccia', 'funghi'] },
  { slug: 'tonno-e-cipolla', name: 'Tonno e Cipolla', description: 'Pomodoro, mozzarella, tonno e cipolla rossa.', sauce: 'rossa', prices: [750, 900, 1200], recipe: ['mozzarella', 'tonno', 'cipolla'] },
  { slug: 'crudo-e-rucola', name: 'Crudo e Rucola', description: 'Pomodoro, mozzarella, prosciutto crudo, rucola e scaglie di parmigiano a crudo.', sauce: 'rossa', prices: [900, 1050, 1400], recipe: ['mozzarella', 'prosciutto-crudo', 'rucola', 'parmigiano'] },
  { slug: 'wurstel-e-patatine', name: 'Wurstel e Patatine', description: 'Pomodoro, mozzarella, wurstel e patatine fritte. Il preferito dei più piccoli.', sauce: 'rossa', prices: [750, 900, 1200], recipe: ['mozzarella', 'wurstel', 'patatine'] },
  { slug: 'gamberetti-e-zucchine', name: 'Gamberetti e Zucchine', description: 'Base bianca, mozzarella, gamberetti e zucchine.', sauce: 'bianca', prices: [950, 1150, 1500], recipe: ['mozzarella', 'gamberetti', 'zucchine'] },
  { slug: 'mortazza', name: 'Mortazza', description: 'Base bianca, mozzarella, mortadella, burrata a crudo e granella di pistacchio.', sauce: 'bianca', prices: [1000, 1200, 1600], recipe: ['mozzarella', 'mortadella', 'burrata', 'pistacchio'], badges: ['novita'] },
  { slug: 'bismarck', name: 'Bismarck', description: 'Pomodoro, mozzarella, prosciutto cotto e uovo.', sauce: 'rossa', prices: [800, 950, 1250], recipe: ['mozzarella', 'prosciutto-cotto', 'uovo'] },
];

const sizeOrder = ['piccola', 'media', 'grande'] as const;

export const menuPizzas: MenuPizza[] = pizzaSeeds.map((p, index) => ({
  slug: p.slug,
  name: p.name,
  description: p.description,
  sauceSlug: p.sauce,
  badges: p.badges ?? [],
  prices: Object.fromEntries(sizeOrder.map((size, i) => [size, p.prices[i]!])),
  recipe: p.recipe.map((ingredientSlug) => ({ ingredientSlug, portions: 1 })),
  seed: p.slug,
  available: true,
  active: true,
  sortOrder: index + 1,
}));

const product = (
  slug: string,
  name: string,
  category: Product['category'],
  priceCents: number,
  o: Partial<Pick<Product, 'allergens' | 'volumeLabel' | 'description'>> = {},
): Product => ({
  slug,
  name,
  description: '',
  category,
  priceCents,
  allergens: [],
  available: true,
  active: true,
  sortOrder: 0,
  ...o,
});

export const products: Product[] = [
  product('coca-cola-33', 'Coca-Cola', 'drink', 250, { volumeLabel: '33 cl' }),
  product('coca-cola-zero-33', 'Coca-Cola Zero', 'drink', 250, { volumeLabel: '33 cl' }),
  product('aranciata-33', 'Aranciata', 'drink', 250, { volumeLabel: '33 cl' }),
  product('te-limone-33', 'Tè al limone', 'drink', 250, { volumeLabel: '33 cl' }),
  product('acqua-naturale-50', 'Acqua naturale', 'drink', 100, { volumeLabel: '50 cl' }),
  product('acqua-frizzante-50', 'Acqua frizzante', 'drink', 100, { volumeLabel: '50 cl' }),
  product('birra-chiara-33', 'Birra chiara', 'drink', 300, { volumeLabel: '33 cl', allergens: ['gluten'] }),
  product('birra-chiara-66', 'Birra chiara', 'drink', 500, { volumeLabel: '66 cl', allergens: ['gluten'] }),
  product('patatine-fritte', 'Patatine fritte', 'side', 350, { description: 'Croccanti, con sale.' }),
  product('suppli', 'Supplì al telefono', 'side', 200, { description: 'Riso, ragù e mozzarella filante.', allergens: ['gluten', 'eggs', 'milk'] }),
  product('olive-ascolane', 'Olive ascolane', 'side', 400, { description: '6 pezzi.', allergens: ['gluten', 'eggs', 'milk'] }),
  product('bruschette', 'Bruschette al pomodoro', 'side', 350, { description: '3 pezzi.', allergens: ['gluten'] }),
  product('tiramisu', 'Tiramisù', 'dessert', 400, { description: 'Fatto in casa.', allergens: ['gluten', 'eggs', 'milk'] }),
  product('panna-cotta', 'Panna cotta', 'dessert', 350, { description: 'Con coulis di frutti di bosco.', allergens: ['milk'] }),
].map((p, index) => ({ ...p, sortOrder: index + 1 }));
