import type { PizzaSnapshot, SnapshotIngredient } from '@/domain/pricing';
import { formatMoney } from './format';
import { allergenLabel, collectAllergens } from './labels';
import type { OrderEmailData, OrderEmailItem } from './types';

/**
 * Neutral description of an order line, shared by the HTML and plain-text renderers so the two can never disagree
 * about what was ordered. Pure: no markup, no escaping, only Italian wording.
 */

export interface IngredientView {
  /** "Mozzarella ×2 (+1 extra)", "Basilico (dopo cottura)". */
  text: string;
  /** More portions than the classic recipe includes (or an ingredient added to it). */
  extra: boolean;
  afterBake: boolean;
}

export interface ItemView {
  kind: 'pizza' | 'product';
  quantity: number;
  name: string;
  /** A classic pizza the customer changed (ingredients added or removed). */
  modified: boolean;
  unitPrice: string;
  lineTotal: string;
  /** Pizza only: "Media (30 cm), impasto: Integrale, salsa: Rossa". */
  build: string | null;
  ingredients: IngredientView[];
  /** Names of classic ingredients taken off. */
  removed: string[];
  notes: string | null;
  /** Italian allergen names, in the order of the regulation. */
  allergens: string[];
}

export interface OrderView {
  items: ItemView[];
  allergens: string[];
  pizzaCount: number;
}

function ingredientView(ingredient: SnapshotIngredient): IngredientView {
  const extraPortions = ingredient.extraPortions ?? 0;
  const notes: string[] = [];
  if (extraPortions > 0) notes.push(extraPortions >= ingredient.portions ? 'extra' : `+${extraPortions} extra`);
  if (ingredient.afterBake) notes.push('dopo cottura');

  const times = ingredient.portions > 1 ? ` ×${ingredient.portions}` : '';
  const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  return { text: `${ingredient.name}${times}${suffix}`, extra: extraPortions > 0, afterBake: Boolean(ingredient.afterBake) };
}

function describeBuild(config: PizzaSnapshot): string {
  const parts: string[] = [];
  if (config.size) parts.push(`${config.size.name} (${config.size.diameterCm} cm)`);
  if (config.dough) parts.push(`impasto: ${config.dough.name}`);
  if (config.sauce) parts.push(/^senza\b/i.test(config.sauce.name) ? config.sauce.name.toLowerCase() : `salsa: ${config.sauce.name}`);
  return parts.join(', ');
}

const labelsOf = (codes: ReadonlyArray<string>): string[] => collectAllergens([codes]).map(allergenLabel);

export function buildItemView(item: OrderEmailItem): ItemView {
  const base = {
    quantity: item.quantity,
    name: item.name,
    unitPrice: formatMoney(item.unitPriceCents),
    lineTotal: formatMoney(item.lineTotalCents),
    notes: item.notes?.trim() ? item.notes.trim() : null,
    allergens: labelsOf(item.allergens),
  };

  const config = item.config as Partial<PizzaSnapshot> | undefined;
  if (config?.type !== 'pizza') {
    return { ...base, kind: 'product', modified: false, build: null, ingredients: [], removed: [] };
  }

  const ingredients = (config.ingredients ?? []).map(ingredientView);
  const removed = (config.removed ?? []).map((r) => r.name);
  const modified = Boolean(config.menuSlug) && (removed.length > 0 || ingredients.some((i) => i.extra));
  return { ...base, kind: 'pizza', modified, build: describeBuild(config as PizzaSnapshot), ingredients, removed };
}

export function buildOrderView(order: OrderEmailData): OrderView {
  const items = order.items.map(buildItemView);
  return {
    items,
    allergens: labelsOf(collectAllergens(order.items.map((item) => item.allergens))),
    pizzaCount: items.reduce((sum, item) => sum + (item.kind === 'pizza' ? item.quantity : 0), 0),
  };
}
