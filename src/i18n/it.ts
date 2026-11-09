import type { AllergenCode } from '@/domain/allergens';
import type { IngredientCategory, ProductCategory } from '@/domain/catalog';
import type { OrderStatus } from '@/domain/order-status';
import type { Weekday } from '@/domain/slots';

/**
 * Italian UI strings. Every user-visible string lives in a dictionary like this one.
 * To add a language: create `en.ts` typed as `Messages`, then pick the dictionary per request (cookie / header)
 * in `src/i18n/index.ts`. Plurals and interpolation are plain functions, so the compiler checks every call site.
 */
export const it = {
  common: {
    loading: 'Caricamento…',
    close: 'Chiudi',
    back: 'Indietro',
    cancel: 'Annulla',
    save: 'Salva',
    remove: 'Rimuovi',
    add: 'Aggiungi',
    free: 'Gratis',
    soldOut: 'Esaurito',
    vatIncluded: 'IVA inclusa',
    skipToContent: 'Vai al contenuto',
    from: 'da',
    total: 'Totale',
    subtotal: 'Subtotale',
    optional: 'facoltativo',
    errorGeneric: 'Qualcosa non ha funzionato. Riprova tra un attimo.',
  },

  allergens: {
    gluten: 'Glutine',
    crustaceans: 'Crostacei',
    eggs: 'Uova',
    fish: 'Pesce',
    peanuts: 'Arachidi',
    soy: 'Soia',
    milk: 'Latte',
    nuts: 'Frutta a guscio',
    celery: 'Sedano',
    mustard: 'Senape',
    sesame: 'Sesamo',
    sulphites: 'Solfiti',
    lupin: 'Lupini',
    molluscs: 'Molluschi',
  } satisfies Record<AllergenCode, string>,

  allergenNotice: {
    title: 'Allergeni',
    none: 'Nessun allergene dichiarato',
    contains: 'Contiene',
    disclaimer:
      'Gli allergeni indicati sono quelli degli ingredienti. In cucina possono essere presenti tracce di altri allergeni: se hai un’allergia grave, chiamaci prima di ordinare.',
  },

  categories: {
    cheese: 'Formaggi',
    cured: 'Salumi',
    veg: 'Verdure',
    fish: 'Pesce',
    extra: 'Extra',
  } satisfies Record<IngredientCategory, string>,

  productCategories: {
    drink: 'Bevande',
    side: 'Fritti e contorni',
    dessert: 'Dolci',
  } satisfies Record<ProductCategory, string>,

  orderStatus: {
    awaiting_payment: 'In attesa di pagamento',
    new: 'Nuovo',
    preparing: 'In preparazione',
    ready: 'Pronto',
    completed: 'Ritirato',
    cancelled: 'Annullato',
    expired: 'Scaduto',
  } satisfies Record<OrderStatus, string>,

  weekdays: {
    mon: 'Lunedì',
    tue: 'Martedì',
    wed: 'Mercoledì',
    thu: 'Giovedì',
    fri: 'Venerdì',
    sat: 'Sabato',
    sun: 'Domenica',
  } satisfies Record<Weekday, string>,

  badges: {
    vegetariana: 'Vegetariana',
    vegana: 'Vegana',
    piccante: 'Piccante',
    novita: 'Novità',
    bestseller: 'Più ordinata',
  } as Record<string, string>,

  diet: {
    vegetarian: 'Vegetariano',
    vegan: 'Vegano',
    spicy: 'Piccante',
    afterBake: 'A crudo',
  },

  plural: {
    pizzas: (n: number) => (n === 1 ? '1 pizza' : `${n} pizze`),
    items: (n: number) => (n === 1 ? '1 articolo' : `${n} articoli`),
    ingredients: (n: number) => (n === 1 ? '1 ingrediente' : `${n} ingredienti`),
    portions: (n: number) => (n === 1 ? '1 porzione' : `${n} porzioni`),
  },
} as const;

export type Messages = typeof it;
