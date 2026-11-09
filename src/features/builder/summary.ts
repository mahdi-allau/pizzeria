import type { PricedLine } from '@/domain/pricing';

/** One line of the "Sulla tua pizza" ticket. */
export interface SummaryRow {
  slug: string;
  name: string;
  portions: number;
  /** Portions beyond what the classic pizza already includes (0 on a from-scratch pizza). */
  extraPortions: number;
  /** What this ingredient adds to the price. */
  cents: number;
  /** Part of the classic recipe (at least one portion is already in the classic's price). */
  included: boolean;
}

export function summaryRows(priced: PricedLine): SummaryRow[] {
  const snapshot = priced.snapshot;
  if (snapshot.type !== 'pizza') return [];
  const cents = new Map<string, number>();
  for (const entry of priced.breakdown) if (entry.kind === 'topping') cents.set(entry.slug, entry.cents);
  const fromClassic = snapshot.menuSlug !== undefined;
  return snapshot.ingredients.map((i) => ({
    slug: i.slug,
    name: i.name,
    portions: i.portions,
    extraPortions: i.extraPortions,
    cents: cents.get(i.slug) ?? 0,
    included: fromClassic && i.extraPortions < i.portions,
  }));
}

/** Names of recipe ingredients the customer took off a classic. */
export function removedIngredients(priced: PricedLine): string[] {
  return priced.snapshot.type === 'pizza' ? priced.snapshot.removed.map((r) => r.name) : [];
}
