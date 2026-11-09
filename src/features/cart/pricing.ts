'use client';

import { useMemo } from 'react';
import type { Catalog } from '@/domain/catalog';
import { type PricedLine, PricingError, priceLine } from '@/domain/pricing';
import { type CartLine, toCartInput, useCartStore } from './store';

export interface PricedCartLine {
  line: CartLine;
  priced: PricedLine | null;
  /** Set when the line can no longer be ordered (sold out, removed from the menu...). */
  error: PricingError | null;
}

/**
 * Live prices for the cart, computed in the browser with the SAME pure function the server runs at checkout.
 * The server recomputes everything from the database; this is for display only.
 */
export function useCartPricing(catalog: Catalog) {
  const lines = useCartStore((s) => s.lines);
  return useMemo(() => {
    const inputs = toCartInput(lines);
    const rows: PricedCartLine[] = lines.map((line, i) => {
      try {
        return { line, priced: priceLine(catalog, inputs[i]!), error: null };
      } catch (error) {
        if (error instanceof PricingError) return { line, priced: null, error };
        throw error;
      }
    });
    const valid = rows.filter((r) => r.priced);
    const totalCents = valid.reduce((sum, r) => sum + r.priced!.lineTotalCents, 0);
    const pizzaCount = valid.reduce((n, r) => n + (r.priced!.type === 'pizza' ? r.priced!.quantity : 0), 0);
    return { rows, totalCents, pizzaCount, hasProblems: rows.some((r) => r.error) };
  }, [lines, catalog]);
}
