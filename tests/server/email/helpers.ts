import type { CartLineInput } from '@/domain/cart';
import { priceCart } from '@/domain/pricing';
import type { OrderEmailData, OrderEmailItem } from '@/server/email/types';
import { testCatalog } from '../../fixtures/catalog';

/** Order items built by the real pricing engine, so the snapshots always have the shape the database stores. */
export function itemsFromCart(lines: CartLineInput[]): OrderEmailItem[] {
  return priceCart(testCatalog, lines).lines.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: line.lineTotalCents,
    notes: line.notes ?? null,
    allergens: line.allergens,
    config: line.snapshot,
  }));
}

/** Two Diavola with a double mozzarella and extra funghi, a Margherita without basil, a custom pizza and two colas. */
export const SAMPLE_CART: CartLineInput[] = [
  {
    type: 'pizza',
    quantity: 2,
    notes: 'ben cotta',
    pizza: {
      menuSlug: 'diavola',
      size: 'media',
      dough: 'integrale',
      sauce: 'rossa',
      ingredients: [
        { slug: 'mozzarella', portions: 2 },
        { slug: 'salame-piccante', portions: 1 },
        { slug: 'funghi', portions: 1 },
      ],
    },
  },
  {
    type: 'pizza',
    quantity: 1,
    pizza: { menuSlug: 'margherita', size: 'piccola', dough: 'classica', sauce: 'rossa', ingredients: [{ slug: 'mozzarella', portions: 1 }] },
  },
  {
    type: 'pizza',
    quantity: 1,
    pizza: {
      size: 'grande',
      dough: 'classica',
      sauce: 'bianca',
      ingredients: [
        { slug: 'mozzarella', portions: 1 },
        { slug: 'acciughe', portions: 1 },
        { slug: 'basilico', portions: 1 },
      ],
    },
  },
  { type: 'product', slug: 'cola', quantity: 2 },
];

export function makeOrder(overrides: Partial<OrderEmailData> = {}, lines: CartLineInput[] = SAMPLE_CART): OrderEmailData {
  const items = itemsFromCart(lines);
  return {
    id: '7f0a7a3e-0c3b-4c63-9f4e-3b2f1d9d0a11',
    number: 1234,
    publicToken: 'tok_AbC123xyz',
    customerName: 'Mario Rossi',
    customerEmail: 'mario.rossi@example.com',
    customerPhone: '+39 333 123 4567',
    pickupAt: new Date('2026-11-08T18:30:00Z'), // 19:30 in Rome
    totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    notes: null,
    items,
    ...overrides,
  };
}

/** What a person actually sees: no <style> blocks, no tags, a few entities decoded, whitespace collapsed. */
export function visibleText(markup: string): string {
  return markup
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
