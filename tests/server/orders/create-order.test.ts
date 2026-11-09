import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { menuPizzas, orderEvents, orderItems, orders, products, realtimeEvents, settings } from '@/db/schema';
import { CheckoutError, attachPaymentIntent, createPendingOrder, loadSlotLoad } from '@/server/orders';
import { toSlotRules, loadSettings } from '@/server/settings';
import { createTestDb } from '../../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, SLOT, SLOT_2, T0, checkoutInput, cola, margherita, plusMinutes, setCapacity } from './_fixtures';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(orders);
  await handle.db.delete(realtimeEvents);
  await setCapacity(handle.db, 8);
  await handle.db.update(settings).set({ shopOpen: true, reopenAt: null, closedMessage: null }).where(eq(settings.id, 1));
});

const opts = { now: T0, provider: 'mock' as const };

async function expectCheckoutError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CheckoutError);
  expect((error as CheckoutError).code).toBe(code);
  return error as CheckoutError;
}

describe('createPendingOrder', () => {
  it('prices server-side and stores the order, frozen items and a created event', async () => {
    const input = checkoutInput({ notes: 'Senza fretta', cart: [{ ...margherita(2), notes: 'ben cotta' }, cola(1)] });
    const result = await createPendingOrder(handle.db, input, opts);

    expect(result.reused).toBe(false);
    const { order } = result;
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalCents).toBe(MARGHERITA_MEDIA * 2 + COCA_COLA);
    expect(order.number).toBeGreaterThanOrEqual(1001);
    expect(order.publicToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(order.paymentIntentId).toBeNull();

    const [row] = await handle.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      pizzaCount: 2,
      customerName: 'Mario Rossi',
      customerPhone: '+393331234567',
      customerEmail: 'mario.rossi@example.it',
      notes: 'Senza fretta',
      paymentProvider: 'mock',
      clientRequestId: input.clientRequestId,
      currency: 'eur',
    });
    expect(row!.pickupAt.toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(row!.reservationExpiresAt!.toISOString()).toBe(plusMinutes(T0, 15).toISOString());
    expect(row!.termsAcceptedAt!.toISOString()).toBe(T0.toISOString());

    const items = await handle.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.position);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      position: 0,
      kind: 'pizza',
      name: 'Margherita',
      quantity: 2,
      unitPriceCents: MARGHERITA_MEDIA,
      lineTotalCents: MARGHERITA_MEDIA * 2,
      layoutSeed: 'margherita', // menu seed when the browser sent none
      notes: 'ben cotta',
    });
    expect(items[0]!.config).toMatchObject({ type: 'pizza', menuSlug: 'margherita', size: { slug: 'media' } });
    expect(items[0]!.allergens).toEqual(expect.arrayContaining(['gluten', 'milk']));
    expect(items[1]).toMatchObject({ position: 1, kind: 'product', name: 'Coca-Cola', quantity: 1, lineTotalCents: COCA_COLA, layoutSeed: null });

    const events = await handle.db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'created', actor: 'system', toStatus: 'awaiting_payment' });

    // Unpaid orders never reach the kitchen's live feed.
    expect(await handle.db.select().from(realtimeEvents)).toHaveLength(0);
  });

  it('uses the seed picked by the browser, or a random one for a from-scratch pizza', async () => {
    const custom = { type: 'pizza' as const, pizza: { size: 'media', dough: 'classica', sauce: 'rossa', ingredients: [{ slug: 'mozzarella', portions: 1 }] }, quantity: 1 };
    const seeded = { ...margherita(1), pizza: { ...margherita(1).pizza, seed: 'abc123' } };
    const { order } = await createPendingOrder(handle.db, checkoutInput({ cart: [seeded, custom], expectedTotalCents: 650 + 550 + 150 }), opts);
    const items = await handle.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.position);
    expect(items[0]!.layoutSeed).toBe('abc123');
    expect(items[1]!.name).toBe('Pizza personalizzata');
    expect(items[1]!.layoutSeed).toMatch(/^[a-z0-9]{8,32}$/);
  });

  it('honours a custom hold time', async () => {
    const { order } = await createPendingOrder(handle.db, checkoutInput(), { ...opts, holdMinutes: 5 });
    const [row] = await handle.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.reservationExpiresAt!.toISOString()).toBe(plusMinutes(T0, 5).toISOString());
  });

  describe('idempotency on clientRequestId', () => {
    it('returns the same order for a retried identical request', async () => {
      const input = checkoutInput();
      const first = await createPendingOrder(handle.db, input, opts);
      const second = await createPendingOrder(handle.db, { ...input, customer: { ...input.customer } }, { ...opts, now: plusMinutes(T0, 1) });
      expect(second.reused).toBe(true);
      expect(second.order.id).toBe(first.order.id);
      expect(await handle.db.select().from(orders)).toHaveLength(1);
    });

    it('refuses the same id with a different payload', async () => {
      const input = checkoutInput();
      await createPendingOrder(handle.db, input, opts);
      await expectCheckoutError(createPendingOrder(handle.db, { ...input, pickupAt: SLOT_2 }, opts), 'IDEMPOTENCY_CONFLICT');
      await expectCheckoutError(
        createPendingOrder(handle.db, { ...input, cart: [margherita(1)], expectedTotalCents: MARGHERITA_MEDIA }, opts),
        'IDEMPOTENCY_CONFLICT',
      );
      await expectCheckoutError(
        createPendingOrder(handle.db, { ...input, customer: { ...input.customer, email: 'altro@example.it' } }, opts),
        'IDEMPOTENCY_CONFLICT',
      );
    });

    it('refuses to reuse an order that expired or was cancelled before payment', async () => {
      const input = checkoutInput();
      const { order } = await createPendingOrder(handle.db, input, opts);
      await handle.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, order.id));
      const error = await expectCheckoutError(createPendingOrder(handle.db, input, opts), 'IDEMPOTENCY_CONFLICT');
      expect(error.message).toMatch(/scadut/);
    });

    it('creates a single order when the same request races itself', async () => {
      const input = checkoutInput();
      const results = await Promise.all([createPendingOrder(handle.db, input, opts), createPendingOrder(handle.db, input, opts)]);
      expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
      expect(results.map((r) => r.reused).sort()).toEqual([false, true]);
    });
  });

  describe('pricing', () => {
    it('rejects a total that differs from the server price, returning the server-priced cart', async () => {
      const error = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput({ expectedTotalCents: 100 }), opts), 'PRICE_MISMATCH');
      expect(error.details).toMatchObject({ expectedTotalCents: 100, computedTotalCents: MARGHERITA_MEDIA * 2 + COCA_COLA });
      expect(error.details.cart).toMatchObject({
        totalCents: MARGHERITA_MEDIA * 2 + COCA_COLA,
        lines: [
          { name: 'Margherita', quantity: 2, unitPriceCents: MARGHERITA_MEDIA, lineTotalCents: MARGHERITA_MEDIA * 2 },
          { name: 'Coca-Cola', quantity: 1, unitPriceCents: COCA_COLA, lineTotalCents: COCA_COLA },
        ],
      });
      expect(await handle.db.select().from(orders)).toHaveLength(0);
    });

    it('reports a sold-out item with its slug', async () => {
      await handle.db.update(products).set({ available: false }).where(eq(products.slug, 'coca-cola-33'));
      try {
        const error = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput(), opts), 'ITEM_UNAVAILABLE');
        expect(error.details.slug).toBe('coca-cola-33');
      } finally {
        await handle.db.update(products).set({ available: true }).where(eq(products.slug, 'coca-cola-33'));
      }
    });

    it('treats an unknown slug as unavailable and a structurally impossible cart as invalid', async () => {
      const unknown = await expectCheckoutError(
        createPendingOrder(handle.db, checkoutInput({ cart: [{ type: 'product', slug: 'birra-che-non-esiste', quantity: 1 }], expectedTotalCents: 0 }), opts),
        'ITEM_UNAVAILABLE',
      );
      expect(unknown.details.slug).toBe('birra-che-non-esiste');

      const dup = { ...margherita(1), pizza: { ...margherita(1).pizza, ingredients: [{ slug: 'mozzarella', portions: 1 }, { slug: 'mozzarella', portions: 1 }] } };
      await expectCheckoutError(createPendingOrder(handle.db, checkoutInput({ cart: [dup], expectedTotalCents: 0 }), opts), 'INVALID_CART');
    });

    it('reports a sold-out menu pizza', async () => {
      await handle.db.update(menuPizzas).set({ available: false }).where(eq(menuPizzas.slug, 'margherita'));
      try {
        const error = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput(), opts), 'ITEM_UNAVAILABLE');
        expect(error.details.slug).toBe('margherita');
      } finally {
        await handle.db.update(menuPizzas).set({ available: true }).where(eq(menuPizzas.slug, 'margherita'));
      }
    });
  });

  describe('shop and slots', () => {
    it('refuses orders while the shop is temporarily closed', async () => {
      await handle.db.update(settings).set({ shopOpen: false, closedMessage: 'Chiusi per ferie' }).where(eq(settings.id, 1));
      const error = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput(), opts), 'SHOP_CLOSED');
      expect(error.details.closedMessage).toBe('Chiusi per ferie');
    });

    it('rejects a slot that is too soon, off-grid or outside opening hours', async () => {
      const tooSoon = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput(), { ...opts, now: plusMinutes(T0, 50) }), 'SLOT_UNAVAILABLE');
      expect(tooSoon.details.reason).toBe('too_soon');
      const offGrid = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput({ pickupAt: '2026-11-10T17:07:00Z' }), opts), 'SLOT_UNAVAILABLE');
      expect(offGrid.details.reason).toBe('not_a_slot');
      const closed = await expectCheckoutError(createPendingOrder(handle.db, checkoutInput({ pickupAt: '2026-11-10T10:00:00Z' }), opts), 'SLOT_UNAVAILABLE');
      expect(closed.details.reason).toBe('closed');
    });

    it('counts paid and still-held orders against capacity, but not expired holds', async () => {
      await setCapacity(handle.db, 4);
      await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(3)], expectedTotalCents: 3 * MARGHERITA_MEDIA }), opts);

      const full = await expectCheckoutError(
        createPendingOrder(handle.db, checkoutInput({ cart: [margherita(2)], expectedTotalCents: 2 * MARGHERITA_MEDIA }), opts),
        'SLOT_UNAVAILABLE',
      );
      expect(full.details.reason).toBe('full');

      // Drinks only: no oven capacity needed.
      await createPendingOrder(handle.db, checkoutInput({ cart: [cola(2)], expectedTotalCents: 2 * COCA_COLA }), opts);

      // 16 minutes later the first hold has lapsed and the slot is free again.
      const later = await createPendingOrder(
        handle.db,
        checkoutInput({ cart: [margherita(2)], expectedTotalCents: 2 * MARGHERITA_MEDIA }),
        { ...opts, now: plusMinutes(T0, 16) },
      );
      expect(later.reused).toBe(false);
    });

    it('lets exactly one of two racing checkouts take the last capacity in a slot', async () => {
      await setCapacity(handle.db, 3);
      const attempt = () => createPendingOrder(handle.db, checkoutInput({ cart: [margherita(2)], expectedTotalCents: 2 * MARGHERITA_MEDIA }), opts);
      const settled = await Promise.allSettled([attempt(), attempt(), attempt()]);
      const ok = settled.filter((s) => s.status === 'fulfilled');
      const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) expect((r.reason as CheckoutError).code).toBe('SLOT_UNAVAILABLE');
    });
  });
});

describe('loadSlotLoad', () => {
  it('sums pizzas per slot for paid orders and live holds only', async () => {
    const rules = toSlotRules(await loadSettings(handle.db));
    const a = await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(2)], expectedTotalCents: 2 * MARGHERITA_MEDIA }), opts);
    const b = await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(1)], expectedTotalCents: MARGHERITA_MEDIA }), opts);
    const c = await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(3)], expectedTotalCents: 3 * MARGHERITA_MEDIA, pickupAt: SLOT_2 }), opts);
    const d = await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(1)], expectedTotalCents: MARGHERITA_MEDIA, pickupAt: SLOT_2 }), opts);

    expect(await loadSlotLoad(handle.db, T0, rules)).toEqual({ [SLOT]: 3, [SLOT_2]: 4 });

    await handle.db.update(orders).set({ status: 'new', paymentStatus: 'paid' }).where(eq(orders.id, a.order.id));
    await handle.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, c.order.id));
    await handle.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, d.order.id));

    // After the holds lapse only the paid order still counts.
    expect(await loadSlotLoad(handle.db, plusMinutes(T0, 20), rules)).toEqual({ [SLOT]: 2 });
    expect(b.order.id).toBeDefined();
  });
});

describe('attachPaymentIntent', () => {
  it('stores the PaymentIntent id on the order', async () => {
    const { order } = await createPendingOrder(handle.db, checkoutInput(), opts);
    await attachPaymentIntent(handle.db, order.id, 'pi_test_123');
    const [row] = await handle.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.paymentIntentId).toBe('pi_test_123');
  });

  it('is a no-op for an unknown order id', async () => {
    await expect(attachPaymentIntent(handle.db, randomUUID(), 'pi_x')).resolves.toBe(false);
  });
});
