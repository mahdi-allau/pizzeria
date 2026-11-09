import type { IngredientCategory } from '../../domain/catalog';
import type { IngredientArt } from '../types';
import { cheeseArt } from './ingredients/cheese';
import { curedArt } from './ingredients/cured';
import { extraArt } from './ingredients/extra';
import { fishArt } from './ingredients/fish';
import { vegArt } from './ingredients/veg';
import { fallbackArt } from './fallback';

/**
 * slug → art. To add or replace the look of an ingredient, edit the file for its category in ./ingredients,
 * or drop in a new IngredientArt there. Unknown slugs get a generic category look (see ./fallback).
 */

/** Default draw order by category (higher = on top). Items added after baking get +40 on top of this. */
export const defaultLayer: Record<IngredientCategory, number> = { cheese: 20, veg: 30, cured: 40, fish: 50, extra: 60 };

const all: IngredientArt[] = [...cheeseArt, ...curedArt, ...vegArt, ...fishArt, ...extraArt];
const bySlug = new Map(all.map((art) => [art.slug, art]));

export function getArt(slug: string, category?: IngredientCategory): IngredientArt {
  return bySlug.get(slug) ?? fallbackArt(slug, category);
}

export function hasArt(slug: string): boolean {
  return bySlug.has(slug);
}

export function registeredArt(): readonly IngredientArt[] {
  return all;
}
