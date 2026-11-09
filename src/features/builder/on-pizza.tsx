'use client';

import { Minus, Plus, X } from 'lucide-react';
import type { Dispatch } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { AllergenList } from '@/components/ui/allergen-list';
import { AnimatedPrice, Price } from '@/components/ui/price';
import type { Catalog } from '@/domain/catalog';
import type { BreakdownEntry, PricedLine } from '@/domain/pricing';
import { LIMITS } from '@/domain/limits';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { BuilderAction, BuilderState } from './state';
import { removedIngredients, summaryRows } from './summary';

interface Props {
  catalog: Catalog;
  state: BuilderState;
  /** null when the pizza cannot be priced (e.g. an ingredient just sold out). */
  line: PricedLine | null;
  dispatch: Dispatch<BuilderAction>;
  className?: string;
}

const leader = <span aria-hidden="true" className="mx-2 mb-1.5 min-w-3 flex-1 self-end border-b-2 border-dotted border-charcoal-900/35" />;

function baseLabel(catalog: Catalog, entry: Exclude<BreakdownEntry, { kind: 'topping' }>): string {
  switch (entry.kind) {
    case 'menu':
      return catalog.menuPizzas.find((p) => p.slug === entry.slug)?.name ?? entry.slug;
    case 'base': {
      const size = catalog.sizes.find((s) => s.slug === entry.slug);
      return size ? `Pizza ${size.name.toLowerCase()}, ${size.diameterCm} cm` : 'Base';
    }
    case 'dough':
      return `Impasto ${catalog.doughs.find((d) => d.slug === entry.slug)?.name.toLowerCase() ?? entry.slug}`;
    case 'sauce':
      return `Salsa ${catalog.sauces.find((s) => s.slug === entry.slug)?.name.toLowerCase() ?? entry.slug}`;
  }
}

/**
 * "Sulla tua pizza": the live list of everything on the pizza with its price, styled as the kitchen comanda it
 * becomes. Rows can be adjusted right here.
 */
export function OnPizzaTicket({ catalog, state, line, dispatch, className }: Props) {
  const rows = line ? summaryRows(line) : [];
  const removed = line ? removedIngredients(line) : [];
  const baseRows = line ? line.breakdown.filter((b): b is Exclude<BreakdownEntry, { kind: 'topping' }> => b.kind !== 'topping') : [];
  const maxOf = (slug: string) => {
    const ingredient = catalog.ingredients.find((i) => i.slug === slug);
    return Math.min(ingredient?.maxPortions ?? 1, LIMITS.maxPortions);
  };

  return (
    <section aria-labelledby="on-pizza-title" className={cn('paper ticket-bottom relative px-5 pb-9 pt-5', className)}>
      <h2 id="on-pizza-title" className="display text-[1.7rem]">
        Sulla tua pizza
      </h2>

      <ul className="mt-3 text-[0.95rem]">
        {baseRows.map((b) => (
          <li key={`${b.kind}-${b.slug}`} className="flex items-end py-1 text-charcoal-700">
            <span>{baseLabel(catalog, b)}</span>
            {leader}
            <Price cents={b.cents} />
          </li>
        ))}
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <m.li
              key={row.slug}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="overflow-hidden"
            >
              <div className="flex items-end py-1.5">
                <span className="font-semibold">
                  {row.name}
                  {row.portions > 1 && <span className="figures ml-1 text-tomato-600">×{row.portions}</span>}
                </span>
                {leader}
                <span className="figures text-charcoal-900">{row.included && row.cents === 0 ? 'incluso' : row.cents === 0 ? t.common.free.toLowerCase() : <Price cents={row.cents} />}</span>
                <span className="ml-2 flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'decrement', slug: row.slug })}
                    aria-label={`Togli una porzione di ${row.name}`}
                    className="grid size-8 place-items-center rounded-full text-charcoal-700 hover:bg-charcoal-900/10 active:scale-90"
                  >
                    {row.portions > 1 ? <Minus className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'increment', slug: row.slug, max: maxOf(row.slug) })}
                    disabled={row.portions >= maxOf(row.slug)}
                    aria-label={`Aggiungi una porzione di ${row.name}`}
                    className="grid size-8 place-items-center rounded-full text-charcoal-700 hover:bg-charcoal-900/10 active:scale-90 disabled:opacity-30"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>

      {rows.length === 0 && (
        <p className="mt-2 rounded-sign border border-dashed border-charcoal-900/30 px-3 py-3 text-sm text-charcoal-700">
          Ancora nessun ingrediente. Tocca un ingrediente per farlo cadere sulla pizza.
        </p>
      )}

      {removed.length > 0 && <p className="mt-2 text-sm text-charcoal-700">Senza: {removed.join(', ')}</p>}

      <div className="mt-4 flex items-end border-t-2 border-charcoal-900 pt-3">
        <span className="text-sm font-semibold">{t.common.total}</span>
        {leader}
        {line ? <AnimatedPrice cents={line.unitPriceCents} className="display text-[1.9rem] leading-none" /> : <span>–</span>}
      </div>
      <p className="mt-0.5 text-right text-xs text-charcoal-700">{t.common.vatIncluded}</p>

      {line && <AllergenList codes={line.allergens} tone="paper" className="mt-3" />}

      {state.items.length > 0 && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'clear' })}
          className="mt-3 text-sm font-semibold text-tomato-700 underline decoration-tomato-700/40 underline-offset-4 hover:decoration-tomato-700"
        >
          Svuota gli ingredienti
        </button>
      )}
    </section>
  );
}
