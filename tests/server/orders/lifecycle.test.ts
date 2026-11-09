import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orderEvents, orders, realtimeEvents } from '@/db/schema';
import { InvalidTransitionError } from '@/domain/order-status';
import {
  OrderStateError,
  changeOrderStatus,
  createPendingOrder,
  expireStaleOrders,
  markOrderPaid,
  markPaymentFailed,
  refundOrder,
} from '@/server/orders';
import { createTestDb } from '../../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, T0, checkoutInput, plusMinutes, recordingProvider } from './_fixtures';

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
});

const TOTAL = MARGHERITA_MEDIA * 2 + COCA_COLA;

async function pending(holdMinutes?: number) {
  const { order } = await createPendingOrder(handle.db, checkoutInput(), { now: T0, provider: 'stripe', holdMinutes });
  await handle.db.update(orders).set({ paymentIntentId: `pi_${order.number}` }).where(eq(orders.id, order.id));
  return order;
}

const row = async (id: string) => (await handle.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const events = async (id: string) => handle.db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.id));
const feed = async () => handle.db.select().from(realtimeEvents).orderBy(asc(realtimeEvents.id));

describe('markOrderPaid', () => {
  it('moves awaiting_payment → new, records the payment and notifies the kitchen with a compact summary', async () => {
    const order = await pending();
    const paidAt = plusMinutes(T0, 2);
    const result = await markOrderPaid(handle.db, { orderId: order.id, amountCents: TOTAL, currency: 'eur', now: paidAt });

    expect(result).toMatchObject({ transitioned: true, orderId: order.id, status: 'new' });
    const r = await row(order.id);
    expect(r).toMatchObject({ status: 'new', paymentStatus: 'paid' });
    expect(r.paidAt!.toISOString()).toBe(paidAt.toISOString());

    expect((await events(order.id)).map((e) => [e.type, e.fromStatus, e.toStatus, e.actor])).toEqual([
      ['created', null, 'awaiting_payment', 'system'],
      ['paid', 'awaiting_payment', 'new', 'system'],
    ]);

    const live = await feed();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ kind: 'order.paid', orderId: order.id });
    expect(live[0]!.data).toEqual({
      id: order.id,
      number: order.number,
      pickupAt: order.pickupAt,
      customerName: 'Mario Rossi',
      pizzaCount: 2,
      totalCents: TOTAL,
      itemsSummary: ['2× Margherita (Media)', '1× Coca-Cola'],
    });
  });

  it('can resolve the order by PaymentIntent id', async () => {
    const order = await pending();
    const result = await markOrderPaid(handle.db, { paymentIntentId: `pi_${order.number}`, now: T0 });
    expect(result).toMatchObject({ transitioned: true, orderId: order.id });
  });

  it('is idempotent: a second call changes nothing and emits nothing', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    const again = await markOrderPaid(handle.db, { orderId: order.id, now: plusMinutes(T0, 1) });
    expect(again).toMatchObject({ transitioned: false, alreadyPaid: true, status: 'new' });
    expect(await events(order.id)).toHaveLength(2);
    expect(await feed()).toHaveLength(1);
  });

  it('is race-safe: concurrent confirmations transition exactly once', async () => {
    const order = await pending();
    const results = await Promise.all(Array.from({ length: 4 }, () => markOrderPaid(handle.db, { orderId: order.id, now: T0 })));
    expect(results.filter((r) => r.transitioned)).toHaveLength(1);
    expect((await events(order.id)).filter((e) => e.type === 'paid')).toHaveLength(1);
    expect(await feed()).toHaveLength(1);
  });

  it('does not mark paid when the amount or currency differs, and records the anomaly', async () => {
    const order = await pending();
    expect(await markOrderPaid(handle.db, { orderId: order.id, amountCents: TOTAL - 1, currency: 'eur', now: T0 })).toMatchObject({
      transitioned: false,
      anomaly: 'amount_mismatch',
    });
    expect(await markOrderPaid(handle.db, { orderId: order.id, amountCents: TOTAL, currency: 'usd', now: T0 })).toMatchObject({
      transitioned: false,
      anomaly: 'amount_mismatch',
    });
    expect(await row(order.id)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    const mismatch = (await events(order.id)).filter((e) => e.type === 'payment_amount_mismatch');
    expect(mismatch).toHaveLength(2);
    expect(mismatch[0]!.data).toMatchObject({ expectedCents: TOTAL, receivedCents: TOTAL - 1, receivedCurrency: 'eur' });
    expect(await feed()).toHaveLength(0);
  });

  it('accepts a currency in upper case', async () => {
    const order = await pending();
    expect(await markOrderPaid(handle.db, { orderId: order.id, amountCents: TOTAL, currency: 'EUR', now: T0 })).toMatchObject({ transitioned: true });
  });

  it('revives an order whose reservation already expired (the money was taken) and flags it', async () => {
    const order = await pending();
    await handle.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, order.id));
    const result = await markOrderPaid(handle.db, { orderId: order.id, now: plusMinutes(T0, 30) });
    expect(result).toMatchObject({ transitioned: true, status: 'new', lateAfterExpiry: true });
    expect(await row(order.id)).toMatchObject({ status: 'new', paymentStatus: 'paid' });
    const paid = (await events(order.id)).find((e) => e.type === 'paid')!;
    expect(paid).toMatchObject({ fromStatus: 'expired', toStatus: 'new' });
    expect(paid.data).toMatchObject({ lateAfterExpiry: true });
    expect((await feed())[0]!.data).toMatchObject({ lateAfterExpiry: true, number: order.number });
  });

  it('keeps a cancelled order cancelled but records the payment and raises a refund alert', async () => {
    const order = await pending();
    await changeOrderStatus(handle.db, order.id, 'cancelled', 'admin', { now: T0 });
    await handle.db.delete(realtimeEvents);

    const result = await markOrderPaid(handle.db, { orderId: order.id, now: plusMinutes(T0, 3) });
    expect(result).toMatchObject({ transitioned: false, status: 'cancelled', needsRefund: true, anomaly: 'paid_after_cancel' });
    expect(await row(order.id)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
    expect((await events(order.id)).at(-1)!.type).toBe('paid_after_cancel');
    const live = await feed();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ kind: 'order.updated' });
    expect(live[0]!.data).toMatchObject({ needsRefund: true, number: order.number });
  });
});

describe('markPaymentFailed', () => {
  it('records the failure but keeps the order payable', async () => {
    const order = await pending();
    const result = await markPaymentFailed(handle.db, { orderId: order.id, reason: 'card_declined', now: T0 });
    expect(result).toMatchObject({ recorded: true });
    expect(await row(order.id)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'failed' });
    expect((await events(order.id)).at(-1)).toMatchObject({ type: 'payment_failed' });
    expect((await events(order.id)).at(-1)!.data).toMatchObject({ reason: 'card_declined' });

    // The customer retries and succeeds.
    expect(await markOrderPaid(handle.db, { orderId: order.id, now: T0 })).toMatchObject({ transitioned: true });
  });

  it('never downgrades a paid order', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    const result = await markPaymentFailed(handle.db, { orderId: order.id, now: plusMinutes(T0, 1) });
    expect(result).toMatchObject({ recorded: false });
    expect(await row(order.id)).toMatchObject({ status: 'new', paymentStatus: 'paid' });
  });
});

describe('changeOrderStatus', () => {
  it('drives the kitchen flow, stamping each step and publishing order.status', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });

    const t1 = plusMinutes(T0, 5);
    const r1 = await changeOrderStatus(handle.db, order.id, 'preparing', 'admin', { now: t1 });
    expect(r1).toMatchObject({ from: 'new', to: 'preparing', needsRefund: false });
    await changeOrderStatus(handle.db, order.id, 'ready', 'admin', { now: plusMinutes(T0, 15) });
    await changeOrderStatus(handle.db, order.id, 'completed', 'admin', { now: plusMinutes(T0, 20) });

    const r = await row(order.id);
    expect(r.status).toBe('completed');
    expect(r.preparingAt!.toISOString()).toBe(t1.toISOString());
    expect(r.readyAt).not.toBeNull();
    expect(r.completedAt).not.toBeNull();

    const statusEvents = (await events(order.id)).filter((e) => e.type === 'status_changed');
    expect(statusEvents.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
      ['new', 'preparing', 'admin'],
      ['preparing', 'ready', 'admin'],
      ['ready', 'completed', 'admin'],
    ]);

    const live = (await feed()).filter((e) => e.kind === 'order.status');
    expect(live).toHaveLength(3);
    expect(live[0]!.data).toMatchObject({ from: 'new', to: 'preparing', number: order.number, itemsSummary: expect.any(Array) });
  });

  it('clears later timestamps when stepping back', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    await changeOrderStatus(handle.db, order.id, 'preparing', 'admin', { now: T0 });
    await changeOrderStatus(handle.db, order.id, 'ready', 'admin', { now: T0 });
    await changeOrderStatus(handle.db, order.id, 'preparing', 'admin', { now: T0 });
    expect(await row(order.id)).toMatchObject({ status: 'preparing', readyAt: null });
  });

  it('rejects illegal transitions with InvalidTransitionError and changes nothing', async () => {
    const order = await pending();
    await expect(changeOrderStatus(handle.db, order.id, 'new', 'admin')).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(changeOrderStatus(handle.db, order.id, 'preparing', 'admin')).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await row(order.id)).status).toBe('awaiting_payment');
    expect(await feed()).toHaveLength(0);
  });

  it('flags a refund when a paid order is cancelled, and stores the meta', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    const result = await changeOrderStatus(handle.db, order.id, 'cancelled', 'admin', { now: T0, reason: 'forno guasto' });
    expect(result).toMatchObject({ to: 'cancelled', needsRefund: true });
    const r = await row(order.id);
    expect(r.cancelledAt).not.toBeNull();
    expect((await events(order.id)).at(-1)!.data).toMatchObject({ reason: 'forno guasto', needsRefund: true });
  });

  it('does not flag a refund when an unpaid order is cancelled', async () => {
    const order = await pending();
    expect(await changeOrderStatus(handle.db, order.id, 'cancelled', 'admin', { now: T0 })).toMatchObject({ needsRefund: false });
  });
});

describe('refundOrder', () => {
  it('refunds through the provider and records it', async () => {
    const order = await pending();
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    const { provider, calls } = recordingProvider();
    const result = await refundOrder(handle.db, provider, order.id, { now: T0 });
    expect(result).toEqual({ refundId: `re_rec_pi_${order.number}` });
    expect(calls).toEqual([{ method: 'refund', args: [`pi_${order.number}`, undefined] }]);
    expect((await row(order.id)).paymentStatus).toBe('refunded');
    expect((await events(order.id)).at(-1)).toMatchObject({ type: 'refunded', actor: 'admin' });
  });

  it('refuses to refund an unpaid order', async () => {
    const order = await pending();
    const { provider, calls } = recordingProvider();
    await expect(refundOrder(handle.db, provider, order.id)).rejects.toBeInstanceOf(OrderStateError);
    expect(calls).toHaveLength(0);
  });
});

describe('expireStaleOrders', () => {
  it('expires unpaid orders whose hold lapsed and cancels their payments (best effort), idempotently', async () => {
    const stale = await pending(5);
    const fresh = await pending(30);
    const paid = await pending(5);
    await markOrderPaid(handle.db, { orderId: paid.id, now: T0 });
    const { provider, calls } = recordingProvider({ failCancel: true });

    const now = plusMinutes(T0, 10);
    const result = await expireStaleOrders(handle.db, { now, provider });
    expect(result).toEqual({ expired: 1, orderIds: [stale.id] });
    expect((await row(stale.id)).status).toBe('expired');
    expect((await row(fresh.id)).status).toBe('awaiting_payment');
    expect((await row(paid.id)).status).toBe('new');
    expect((await events(stale.id)).at(-1)).toMatchObject({ type: 'expired', fromStatus: 'awaiting_payment', toStatus: 'expired', actor: 'system' });
    expect(calls).toEqual([{ method: 'cancelPayment', args: [`pi_${stale.number}`] }]);

    expect(await expireStaleOrders(handle.db, { now, provider })).toEqual({ expired: 0, orderIds: [] });
  });

  it('works without a provider', async () => {
    const stale = await pending(5);
    expect(await expireStaleOrders(handle.db, { now: plusMinutes(T0, 10), provider: null })).toEqual({ expired: 1, orderIds: [stale.id] });
  });
});
