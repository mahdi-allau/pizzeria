import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { settings } from '@/db/schema';
import type { CheckoutInput } from '@/server/orders';
import type { PaymentProvider } from '@/server/payments';

/**
 * Shared builders for the orders / payments / api tests.
 * Tuesday 10 Nov 2026, 16:00 UTC = 17:00 in Rome. The shop opens at 18:00 local, so the first bookable slot is
 * 18:00 local = 17:00Z (seeded capacity: 8 pizzas per slot).
 */
export const T0 = new Date('2026-11-10T16:00:00Z');
export const SLOT = '2026-11-10T17:00:00Z';
export const SLOT_2 = '2026-11-10T17:15:00Z';

export const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** Seeded prices: Margherita media = 650, Coca-Cola = 250. */
export const MARGHERITA_MEDIA = 650;
export const COCA_COLA = 250;

export function margherita(quantity = 1) {
  return {
    type: 'pizza' as const,
    pizza: {
      menuSlug: 'margherita',
      size: 'media',
      dough: 'classica',
      sauce: 'rossa',
      ingredients: [
        { slug: 'mozzarella', portions: 1 },
        { slug: 'basilico', portions: 1 },
      ],
    },
    quantity,
  };
}

export function cola(quantity = 1) {
  return { type: 'product' as const, slug: 'coca-cola-33', quantity };
}

export function checkoutBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clientRequestId: randomUUID(),
    customer: { name: 'Mario Rossi', phone: '333 123 4567', email: 'Mario.Rossi@Example.it' },
    pickupAt: SLOT,
    acceptTerms: true,
    expectedTotalCents: MARGHERITA_MEDIA * 2 + COCA_COLA,
    cart: [margherita(2), cola(1)],
    ...overrides,
  };
}

/** A parsed CheckoutInput (what the server works with after validation). */
export function checkoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    clientRequestId: randomUUID(),
    customer: { name: 'Mario Rossi', phone: '+393331234567', email: 'mario.rossi@example.it' },
    pickupAt: SLOT,
    acceptTerms: true,
    expectedTotalCents: MARGHERITA_MEDIA * 2 + COCA_COLA,
    cart: [margherita(2), cola(1)],
    ...overrides,
  };
}

/**
 * In-memory stand-in for the external payment network (Stripe cannot be reached from tests).
 * Records every call so tests can assert what would have been sent.
 */
export function recordingProvider(options: { failCancel?: boolean } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  let n = 0;
  const provider: PaymentProvider = {
    id: 'stripe',
    async createPayment(params) {
      calls.push({ method: 'createPayment', args: [params] });
      n += 1;
      return { paymentIntentId: `pi_rec_${n}`, clientSecret: `pi_rec_${n}_secret_x` };
    },
    async retrievePayment(id) {
      calls.push({ method: 'retrievePayment', args: [id] });
      return { id, status: 'requires_payment_method', clientSecret: `${id}_secret_x` };
    },
    async cancelPayment(id) {
      calls.push({ method: 'cancelPayment', args: [id] });
      if (options.failCancel) throw new Error('network down');
    },
    async refund(id, amountCents) {
      calls.push({ method: 'refund', args: [id, amountCents] });
      return { id: `re_rec_${id}` };
    },
    publishableKey: () => 'pk_test_rec',
  };
  return { provider, calls };
}

export async function setCapacity(db: Db, slotCapacity: number) {
  await db.update(settings).set({ slotCapacity }).where(eq(settings.id, 1));
}
