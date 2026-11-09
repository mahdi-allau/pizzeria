import { randomBytes } from 'node:crypto';
import type { CartLineInput } from '@/domain/cart';
import type { Db } from '@/db/client';
import { orderItems, orders, settings } from '@/db/schema';
import { SAMPLE_CART, itemsFromCart } from './helpers';

export const PICKUP_AT = new Date('2026-11-08T18:30:00Z'); // 19:30 in Rome, a Sunday
export const NOW = new Date('2026-11-08T16:00:00Z'); // 17:00 in Rome, the same day

type OrderValues = typeof orders.$inferInsert;

/** Inserts an order and its items the way checkout stores them (snapshots from the real pricing engine). */
export async function insertOrder(
  db: Db,
  overrides: Partial<OrderValues> = {},
  lines: CartLineInput[] = SAMPLE_CART,
): Promise<{ id: string; number: number; publicToken: string }> {
  const items = itemsFromCart(lines);
  const [order] = await db
    .insert(orders)
    .values({
      publicToken: `tok_${randomBytes(9).toString('base64url')}`,
      status: 'new',
      paymentStatus: 'paid',
      customerName: 'Mario Rossi',
      customerPhone: '+39 333 123 4567',
      customerEmail: 'mario.rossi@example.com',
      pickupAt: PICKUP_AT,
      pizzaCount: items.reduce((sum, item) => sum + (item.config.type === 'pizza' ? item.quantity : 0), 0),
      totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      paymentProvider: 'mock',
      paidAt: NOW,
      ...overrides,
    })
    .returning({ id: orders.id, number: orders.number, publicToken: orders.publicToken });

  await db.insert(orderItems).values(
    items.map((item, index) => ({
      orderId: order!.id,
      position: index,
      kind: item.config.type,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      config: item.config,
      allergens: [...item.allergens] as never,
      notes: item.notes,
    })),
  );
  return { id: order!.id, number: order!.number!, publicToken: order!.publicToken };
}

/** Makes sure the single settings row exists, then sets the alert address (null = none). */
export async function setAlertEmail(db: Db, value: string | null): Promise<void> {
  const { defaultSettingsValues } = await import('@/db/defaults');
  await db.insert(settings).values(defaultSettingsValues()).onConflictDoNothing();
  await db.update(settings).set({ notificationEmail: value });
}
