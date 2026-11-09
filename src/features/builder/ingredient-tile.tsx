'use client';

import { m } from 'framer-motion';
import { Flame, Leaf, Minus } from 'lucide-react';
import type { Ingredient } from '@/domain/catalog';
import { formatEUR } from '@/domain/money';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { IngredientPlate } from './ingredient-plate';

interface Props {
  ingredient: Ingredient;
  portions: number;
  /** Price of one portion on the chosen size. */
  priceCents: number;
  /** Portions of this ingredient already included in the classic pizza being customised. */
  includedPortions: number;
  onCycle: () => void;
  onDecrement: () => void;
}

/**
 * One ingredient in the picker. Tap: add, tap again: double portion, tap again: remove. Once it is on the pizza a
 * minus button gives finer control. Sold-out ingredients stay visible but cannot be tapped.
 */
export function IngredientTile({ ingredient, portions, priceCents, includedPortions, onCycle, onDecrement }: Props) {
  const soldOut = !ingredient.available;
  const selected = portions > 0;
  const atMax = portions >= ingredient.maxPortions;

  const priceLabel = soldOut
    ? t.common.soldOut
    : includedPortions > 0 && portions <= includedPortions
      ? 'Incluso'
      : priceCents === 0
        ? t.common.free
        : `+ ${formatEUR(priceCents)}`;

  const state = soldOut
    ? t.common.soldOut
    : selected
      ? `${t.plural.portions(portions)} sulla pizza${atMax && ingredient.maxPortions > 1 ? ', massimo' : ''}`
      : 'non aggiunto';

  return (
    <li className="relative flex flex-col items-center gap-1.5 text-center">
      <m.button
        type="button"
        onClick={onCycle}
        disabled={soldOut}
        aria-pressed={selected}
        aria-label={`${ingredient.name}, ${priceLabel}, ${state}`}
        whileTap={soldOut ? undefined : { scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={cn(
          'relative grid size-[4.75rem] place-items-center rounded-full transition-[background-color,box-shadow] duration-150',
          'bg-charcoal-800 shadow-[inset_0_0_0_1px_var(--color-charcoal-600),inset_0_-6px_12px_rgba(0,0,0,0.35)]',
          selected && 'bg-charcoal-700 shadow-[inset_0_0_0_2px_var(--color-tomato-400),0_0_0_5px_rgba(217,67,43,0.18)]',
          soldOut && 'opacity-40 saturate-0',
        )}
      >
        <IngredientPlate slug={ingredient.slug} category={ingredient.category} className="size-[3.75rem]" />
        {selected && (
          <m.span
            key={portions}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            className="figures absolute -right-0.5 -top-0.5 grid size-6 place-items-center rounded-full bg-tomato-600 text-xs font-bold text-cream-50 shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            aria-hidden="true"
          >
            {portions > 1 ? `×${portions}` : '✓'}
          </m.span>
        )}
      </m.button>

      {selected && (
        <button
          type="button"
          onClick={onDecrement}
          aria-label={`Togli una porzione di ${ingredient.name}`}
          className="absolute -left-0.5 top-[3.1rem] grid size-7 place-items-center rounded-full bg-charcoal-950 text-cream-100 shadow-[0_0_0_1px_var(--color-charcoal-500),0_2px_6px_rgba(0,0,0,0.5)] hover:bg-charcoal-700 active:scale-90"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
      )}

      <span className="text-balance text-[0.9rem] font-medium leading-tight text-cream-100">{ingredient.name}</span>
      <span className={cn('figures flex items-center gap-1.5 text-[0.8rem]', soldOut ? 'text-tomato-400' : 'text-cream-400')}>
        {priceLabel}
        {ingredient.spicy && (
          <>
            <Flame className="size-3.5 shrink-0 text-tomato-400" aria-hidden="true" />
            <span className="sr-only">{t.diet.spicy}</span>
          </>
        )}
        {ingredient.vegan ? (
          <>
            <Leaf className="size-3.5 shrink-0 text-basil-400" aria-hidden="true" />
            <span className="sr-only">{t.diet.vegan}</span>
          </>
        ) : ingredient.vegetarian ? (
          <>
            <Leaf className="size-3.5 shrink-0 text-cream-400" aria-hidden="true" />
            <span className="sr-only">{t.diet.vegetarian}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}
