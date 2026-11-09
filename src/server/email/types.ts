import type { PizzaSnapshot, ProductSnapshot } from '@/domain/pricing';

/**
 * What the email templates need to know about a paid order. Deliberately independent of the orders service: the
 * notifier reads the rows it needs straight from the database and maps them to these plain objects.
 */

export interface OrderEmailItem {
  /** Frozen display name ("Diavola", "Pizza personalizzata", "Cola 33cl"). */
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Customer note for this line. */
  notes: string | null;
  /** Allergen codes of the whole line, already merged (dough + sauce + ingredients). */
  allergens: readonly string[];
  /** Frozen description of exactly what was ordered. */
  config: PizzaSnapshot | ProductSnapshot;
}

export interface OrderEmailData {
  id: string;
  /** Human-friendly number shown to customer and kitchen. */
  number: number;
  /** Unguessable token of the public status page. */
  publicToken: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickupAt: Date;
  totalCents: number;
  /** Order-level note from the customer. */
  notes: string | null;
  items: OrderEmailItem[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
