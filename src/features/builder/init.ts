import type { Catalog } from '@/domain/catalog';
import { LIMITS } from '@/domain/limits';
import type { BuilderItem } from './state';

/**
 * Where the builder starts, decided from the URL:
 *   /crea                              a fresh pizza
 *   /crea?base=diavola&size=grande     "Personalizza" on a classic
 *   /crea?ing=mozzarella:2,funghi      toppings picked on the home page
 *   /crea?edit=<cart line id>          change a pizza already in the cart (the client loads it)
 * Pure: it only reads the catalog. Unknown, hidden or sold-out things are dropped, never trusted.
 */

export interface BuilderInit {
  size: string;
  dough: string;
  sauce: string;
  seed: string;
  menuSlug?: string;
  items: BuilderItem[];
  step: 1 | 2;
  editLineId?: string;
  /** Plain-language messages for the customer ("Tartufo non è disponibile oggi…"). */
  notices: string[];
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const LINE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function resolveInit(catalog: Catalog, params: Params, seed: string): BuilderInit {
  const sizes = catalog.sizes.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const doughs = catalog.doughs.filter((d) => d.active && d.available).sort((a, b) => a.sortOrder - b.sortOrder);
  const sauces = catalog.sauces.filter((s) => s.active && s.available).sort((a, b) => a.sortOrder - b.sortOrder);
  const ingredients = new Map(catalog.ingredients.map((i) => [i.slug, i]));

  const defaultSize = sizes[Math.floor(sizes.length / 2)]?.slug ?? sizes[0]?.slug ?? 'media';
  const pick = (allowed: readonly string[], wanted: string | undefined, fallback: string) => (wanted && allowed.includes(wanted) ? wanted : fallback);

  const notices: string[] = [];
  const clean = (candidates: BuilderItem[]): BuilderItem[] => {
    const seen = new Set<string>();
    const result: BuilderItem[] = [];
    for (const { slug, portions } of candidates) {
      const ingredient = ingredients.get(slug);
      if (!ingredient || !ingredient.active || seen.has(slug)) continue;
      seen.add(slug);
      if (!ingredient.available) {
        notices.push(`${ingredient.name} non è disponibile oggi e non è stato aggiunto.`);
        continue;
      }
      if (result.length >= LIMITS.maxIngredientsPerPizza) continue;
      result.push({ slug, portions: Math.max(1, Math.min(portions, ingredient.maxPortions, LIMITS.maxPortions)) });
    }
    return result;
  };

  const stepParam = first(params.step);
  const editId = first(params.edit);
  const editLineId = editId && LINE_ID.test(editId) ? editId : undefined;

  const baseSlug = first(params.base);
  const menu = baseSlug ? catalog.menuPizzas.find((p) => p.slug === baseSlug && p.active && p.available) : undefined;

  if (menu) {
    const priced = sizes.filter((s) => menu.prices[s.slug] !== undefined).map((s) => s.slug);
    const wantedSize = first(params.size);
    const size = wantedSize && priced.includes(wantedSize) ? wantedSize : priced.includes(defaultSize) ? defaultSize : (priced[0] ?? defaultSize);
    const sauce = sauces.some((s) => s.slug === menu.sauceSlug) ? menu.sauceSlug : (sauces[0]?.slug ?? menu.sauceSlug);
    return {
      size,
      dough: pick(doughs.map((d) => d.slug), first(params.dough), doughs[0]?.slug ?? 'classica'),
      sauce,
      seed: menu.seed,
      menuSlug: menu.slug,
      items: clean(menu.recipe.map((r) => ({ slug: r.ingredientSlug, portions: r.portions }))),
      step: stepParam === '1' ? 1 : 2,
      ...(editLineId ? { editLineId } : {}),
      notices,
    };
  }

  const wanted = (first(params.ing) ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token): BuilderItem => {
      const [slug = '', amount] = token.split(':');
      const portions = Number.parseInt(amount ?? '1', 10);
      return { slug, portions: Number.isNaN(portions) ? 1 : portions };
    })
    .filter((item) => item.portions > 0);

  return {
    size: pick(sizes.map((s) => s.slug), first(params.size), defaultSize),
    dough: pick(doughs.map((d) => d.slug), first(params.dough), doughs[0]?.slug ?? 'classica'),
    sauce: sauces[0]?.slug ?? 'rossa',
    seed,
    items: clean(wanted),
    step: stepParam === '2' ? 2 : 1,
    ...(editLineId ? { editLineId } : {}),
    notices,
  };
}
