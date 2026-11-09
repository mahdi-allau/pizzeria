import type { IngredientCategory } from '../domain/catalog';
import { doughLook, sauceRadius, unitsPerCm } from './geometry';
import { pieceCount, placePieces } from './layout';
import type { IngredientArt } from './types';

/**
 * Turns "a pizza" (size, dough, sauce, ingredients, seed) into drawable pieces. Pure and deterministic: the browser,
 * the server render and the admin all get exactly the same pizza from the same description.
 */

export interface PizzaViewIngredient {
  slug: string;
  portions: number;
  /** Added after baking: drawn fresh, and on top of everything. */
  afterBake?: boolean;
  /** Used to pick a generic look for an ingredient that has no dedicated art yet. */
  category?: IngredientCategory;
}

export interface PizzaView {
  diameterCm: number;
  /** Dough slug (looks are keyed by it; unknown = classic). */
  dough: string;
  /** Sauce slug (unknown = tomato). */
  sauce: string;
  /** Layout seed: one random string per pizza. */
  seed: string;
  ingredients: readonly PizzaViewIngredient[];
}

export interface PieceInstance {
  /** `<slug>:<index>`, stable across renders. */
  key: string;
  slug: string;
  variant: number;
  x: number;
  y: number;
  rotation: number;
  /** Final scale: the art's 100-unit box → drawing units, including per-piece size jitter. */
  scale: number;
  flip: boolean;
}

export interface LayerGroup {
  slug: string;
  art: IngredientArt;
  /** Effective draw order (art layer, +40 when added after baking). */
  layer: number;
  pieces: PieceInstance[];
}

export interface PizzaModel {
  diameterCm: number;
  /** Radius of the sauce disc: toppings stay inside it. */
  sauceRadius: number;
  /** Groups in draw order, bottom to top. */
  groups: LayerGroup[];
  /** The melted-cheese ingredient, if any (drawn as a contour under the pieces). */
  melt: { slug: string; portions: number } | null;
  /** Continuous drizzles (olive oil), drawn on top. */
  drizzles: Array<{ slug: string; portions: number }>;
}

const AFTER_BAKE_BONUS = 40;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type ArtResolver = (slug: string, category?: IngredientCategory) => IngredientArt;

export function buildPizzaModel(view: PizzaView, resolveArt: ArtResolver): PizzaModel {
  const dough = doughLook(view.dough);
  const sauceR = sauceRadius(dough.crustWidth);
  const perCm = unitsPerCm(view.diameterCm);

  let melt: PizzaModel['melt'] = null;
  const drizzles: PizzaModel['drizzles'] = [];
  const entries: Array<{ order: number; layer: number; group: LayerGroup }> = [];

  view.ingredients.forEach((ingredient, order) => {
    if (ingredient.portions <= 0) return;
    const art = resolveArt(ingredient.slug, ingredient.category);

    if (art.scatter === 'melt') {
      melt ??= { slug: ingredient.slug, portions: ingredient.portions };
      return;
    }
    if (art.scatter === 'drizzle') {
      drizzles.push({ slug: ingredient.slug, portions: ingredient.portions });
      return;
    }

    const count = pieceCount(art, ingredient.portions, view.diameterCm);
    const pieceRadius = (art.sizeCm / 2) * perCm;
    const radius = art.scatter === 'center' ? sauceR * 0.14 : Math.max(60, (sauceR - pieceRadius * 0.35) * 0.97);
    const unitScale = (art.sizeCm * perCm) / 100;

    const pieces = placePieces({
      seed: view.seed,
      slug: ingredient.slug,
      count,
      radius,
      variants: art.variants,
      rotation: art.rotation ?? 'free',
      scaleJitter: art.scaleJitter ?? 0.1,
      candidates: art.scatter === 'sprinkle' ? 4 : 10,
    }).map<PieceInstance>((p) => ({
      key: `${ingredient.slug}:${p.index}`,
      slug: ingredient.slug,
      variant: p.variant,
      x: round2(p.x),
      y: round2(p.y),
      rotation: round2(p.rotation),
      scale: round3(p.scale * unitScale),
      flip: p.flip,
    }));

    const layer = art.layer + (ingredient.afterBake ? AFTER_BAKE_BONUS : 0);
    entries.push({ order, layer, group: { slug: ingredient.slug, art, layer, pieces } });
  });

  entries.sort((a, b) => a.layer - b.layer || a.order - b.order);

  return {
    diameterCm: view.diameterCm,
    sauceRadius: sauceR,
    groups: entries.map((e) => e.group),
    melt,
    drizzles,
  };
}
