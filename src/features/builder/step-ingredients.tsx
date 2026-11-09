'use client';

import { Tabs } from 'radix-ui';
import type { Dispatch } from 'react';
import { toppingPriceCents } from '@/domain/pricing';
import type { Catalog, IngredientCategory, Size } from '@/domain/catalog';
import { LIMITS } from '@/domain/limits';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { toast } from '@/components/toast';
import { IngredientTile } from './ingredient-tile';
import { type BuilderAction, type BuilderState, portionsOf } from './state';

const ORDER: IngredientCategory[] = ['cheese', 'cured', 'veg', 'fish', 'extra'];

interface Props {
  catalog: Catalog;
  state: BuilderState;
  size: Size;
  category: IngredientCategory;
  onCategoryChange: (category: IngredientCategory) => void;
  dispatch: Dispatch<BuilderAction>;
}

/** Step 2: category tabs and the ingredient grid. */
export function StepIngredients({ catalog, state, size, category, onCategoryChange, dispatch }: Props) {
  const menu = state.menuSlug ? catalog.menuPizzas.find((p) => p.slug === state.menuSlug) : undefined;
  const included = new Map(menu?.recipe.map((r) => [r.ingredientSlug, r.portions]));
  const categories = ORDER.filter((c) => catalog.ingredients.some((i) => i.active && i.category === c));
  const countIn = (c: IngredientCategory) =>
    state.items.filter((item) => catalog.ingredients.find((i) => i.slug === item.slug)?.category === c).length;

  const cycle = (slug: string, max: number) => {
    if (portionsOf(state, slug) === 0 && state.items.length >= LIMITS.maxIngredientsPerPizza) {
      toast(`Al massimo ${LIMITS.maxIngredientsPerPizza} ingredienti per pizza`, 'info');
      return;
    }
    dispatch({ type: 'cycle', slug, max });
  };

  return (
    <Tabs.Root value={category} onValueChange={(v) => onCategoryChange(v as IngredientCategory)}>
      <Tabs.List
        aria-label="Categorie di ingredienti"
        // On phones the last tab is cut off on purpose, as a hint that the row scrolls.
        className="flex gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(90deg,#000_calc(100%-36px),transparent)]"
      >
        {categories.map((c) => {
          const count = countIn(c);
          return (
            <Tabs.Trigger
              key={c}
              value={c}
              className={cn(
                'relative shrink-0 whitespace-nowrap rounded-sign px-3.5 py-2.5 text-[0.95rem] font-semibold text-cream-400 transition-colors',
                'hover:text-cream-100 data-[state=active]:text-cream-50',
                'after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-tomato-500 after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100',
              )}
            >
              {t.categories[c]}
              {count > 0 && <span className="figures ml-1.5 rounded-full bg-tomato-600 px-1.5 py-0.5 text-[0.7rem] text-cream-50">{count}</span>}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {categories.map((c) => (
        <Tabs.Content key={c} value={c} className="outline-none">
          <ul className="grid grid-cols-3 gap-x-2 gap-y-6 px-4 pb-8 pt-5 sm:grid-cols-4">
            {catalog.ingredients
              .filter((i) => i.active && i.category === c)
              .map((ingredient) => {
                const max = Math.min(ingredient.maxPortions, LIMITS.maxPortions);
                return (
                  <IngredientTile
                    key={ingredient.slug}
                    ingredient={ingredient}
                    portions={portionsOf(state, ingredient.slug)}
                    priceCents={toppingPriceCents(ingredient, size)}
                    includedPortions={included.get(ingredient.slug) ?? 0}
                    onCycle={() => cycle(ingredient.slug, max)}
                    onDecrement={() => dispatch({ type: 'decrement', slug: ingredient.slug })}
                  />
                );
              })}
          </ul>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
