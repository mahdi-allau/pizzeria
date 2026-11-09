import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orderEvents, orders, paymentEvents, realtimeEvents } from '@/db/schema';
import { changeOrderStatus, createPendingOrder } from '@/server/orders';
import { processStripeEvent } from '@/server/payments';
import { createTestDb } from '../../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, T0, checkoutInput, plusMinutes } from '../orders/_fixtures';
import { chargeRefundedEvent, disputeEvent, evtId, paymentIntentEvent } from './_events';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(orders);
  await handle.db.delete(paymentEvents);
  await handle.db.delete(realtimeEvents);
});

const TOTAL = MARGHERITA_MEDIA * 2 + COCA_COLA;

async function order() {
  const { order: o } = await createPendingOrder(handle.db, checkoutInput(), { now: T0, provider: 'stripe' });
  const piId = `pi_${o.number}`;
  await handle.db.update(orders).set({ paymentIntentId: piId }).where(eq(orders.id, o.id));
  return { ...o, piId };
}
const row = async (id: string) => (await handle.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const eventTypes = async (id: string) =>
  (await handle.db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.id))).map((e) => e.type);
const succeeded = (o: { id: string; piId: string }, over: Partial<Parameters<typeof paymentIntentEvent>[1]> = {}) =>
  paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL, ...over });
const opts = { now: plusMinutes(T0, 2) };

describe('processStripeEvent', () => {
  it('payment_intent.succeeded marks the order paid and records the event id', async () => {
    const o = await order();
    const event = succeeded(o);
    expect(await processStripeEvent(handle.db, event, opts)).toEqual({ outcome: 'paid', orderId: o.id, orderPaid: true });
    expect(await row(o.id)).toMatchObject({ status: 'new', paymentStatus: 'paid' });
    const [recorded] = await handle.db.select().from(paymentEvents).where(eq(paymentEvents.id, event.id));
    expect(recorded).toMatchObject({ provider: 'stripe', type: 'payment_intent.succeeded', orderId: o.id, outcome: 'paid' });
    expect((await handle.db.select().from(realtimeEvents)).map((e) => e.kind)).toEqual(['order.paid']);
  });

  it('a redelivered event is a duplicate that still reports the order (so notifications can be re-run)', async () => {
    const o = await order();
    const event = succeeded(o);
    await processStripeEvent(handle.db, event, opts);
    expect(await processStripeEvent(handle.db, event, opts)).toEqual({ outcome: 'duplicate', orderId: o.id, previousOutcome: 'paid', orderPaid: true });
    expect((await eventTypes(o.id)).filter((t) => t === 'paid')).toHaveLength(1);
    expect(await handle.db.select().from(realtimeEvents)).toHaveLength(1);
  });

  it('two simultaneous deliveries of the same event transition exactly once', async () => {
    const o = await order();
    const event = succeeded(o);
    const results = await Promise.all([processStripeEvent(handle.db, event, opts), processStripeEvent(handle.db, structuredClone(event), opts)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['duplicate', 'paid']);
    expect((await eventTypes(o.id)).filter((t) => t === 'paid')).toHaveLength(1);
    expect(await handle.db.select().from(paymentEvents)).toHaveLength(1);
  });

  it('a second, different success event for a paid order is a harmless repeat', async () => {
    const o = await order();
    await processStripeEvent(handle.db, succeeded(o), opts);
    expect(await processStripeEvent(handle.db, succeeded(o), opts)).toEqual({ outcome: 'already_paid', orderId: o.id, orderPaid: true });
  });

  it('finds the order by PaymentIntent id when metadata is missing', async () => {
    const o = await order();
    expect(await processStripeEvent(handle.db, succeeded(o, { orderId: null }), opts)).toMatchObject({ outcome: 'paid', orderId: o.id });
  });

  it('records but ignores events for unknown orders (including a malformed metadata id)', async () => {
    const unknown = paymentIntentEvent('payment_intent.succeeded', { piId: 'pi_nobody', orderId: randomUUID(), amount: 100 });
    expect(await processStripeEvent(handle.db, unknown, opts)).toEqual({ outcome: 'unknown_order', orderPaid: false });
    const malformed = paymentIntentEvent('payment_intent.succeeded', { piId: 'pi_nobody2', orderId: "x' OR 1=1 --", amount: 100 });
    expect(await processStripeEvent(handle.db, malformed, opts)).toMatchObject({ outcome: 'unknown_order' });
    expect((await handle.db.select().from(paymentEvents)).map((e) => e.outcome)).toEqual(['unknown_order', 'unknown_order']);
  });

  it('refuses to mark paid when the amount received differs', async () => {
    const o = await order();
    expect(await processStripeEvent(handle.db, succeeded(o, { amount: TOTAL - 50 }), opts)).toEqual({
      outcome: 'amount_mismatch',
      orderId: o.id,
      orderPaid: false,
    });
    expect(await row(o.id)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    expect(await eventTypes(o.id)).toContain('payment_amount_mismatch');
  });

  it('payment_failed is recorded, and never downgrades a payment that already succeeded (out-of-order delivery)', async () => {
    const a = await order();
    const failed = paymentIntentEvent('payment_intent.payment_failed', { piId: a.piId, orderId: a.id, failureCode: 'card_declined' });
    expect(await processStripeEvent(handle.db, failed, opts)).toEqual({ outcome: 'failed_recorded', orderId: a.id, orderPaid: false });
    expect(await row(a.id)).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'failed' });

    const b = await order();
    await processStripeEvent(handle.db, succeeded(b), opts);
    const late = paymentIntentEvent('payment_intent.payment_failed', { piId: b.piId, orderId: b.id });
    expect(await processStripeEvent(handle.db, late, opts)).toEqual({ outcome: 'failed_ignored', orderId: b.id, orderPaid: false });
    expect(await row(b.id)).toMatchObject({ status: 'new', paymentStatus: 'paid' });
  });

  it('payment_intent.canceled cancels an unpaid order, and is ignored once paid', async () => {
    const a = await order();
    const canceled = paymentIntentEvent('payment_intent.canceled', { piId: a.piId, orderId: a.id });
    expect(await processStripeEvent(handle.db, canceled, opts)).toEqual({ outcome: 'cancelled', orderId: a.id, orderPaid: false });
    expect((await row(a.id)).status).toBe('cancelled');

    const b = await order();
    await processStripeEvent(handle.db, succeeded(b), opts);
    const lateCancel = paymentIntentEvent('payment_intent.canceled', { piId: b.piId, orderId: b.id });
    expect(await processStripeEvent(handle.db, lateCancel, opts)).toMatchObject({ outcome: 'ignored', orderId: b.id });
    expect((await row(b.id)).status).toBe('new');
  });

  it('a success after the hold expired revives the order; after a cancel it raises a refund alert', async () => {
    const a = await order();
    await handle.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, a.id));
    expect(await processStripeEvent(handle.db, succeeded(a), opts)).toEqual({ outcome: 'paid', orderId: a.id, orderPaid: true, lateAfterExpiry: true });

    const b = await order();
    await changeOrderStatus(handle.db, b.id, 'cancelled', 'admin', { now: T0 });
    expect(await processStripeEvent(handle.db, succeeded(b), opts)).toEqual({ outcome: 'paid_after_cancel', orderId: b.id, orderPaid: false });
    expect(await row(b.id)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
  });

  it('charge.refunded marks a full refund; a partial refund is only recorded', async () => {
    const a = await order();
    await processStripeEvent(handle.db, succeeded(a), opts);
    expect(await processStripeEvent(handle.db, chargeRefundedEvent({ piId: a.piId, amount: TOTAL }), opts)).toEqual({
      outcome: 'refunded',
      orderId: a.id,
      orderPaid: false,
    });
    expect((await row(a.id)).paymentStatus).toBe('refunded');

    const b = await order();
    await processStripeEvent(handle.db, succeeded(b), opts);
    const partial = chargeRefundedEvent({ piId: b.piId, amount: TOTAL, refunded: false, amountRefunded: 100 });
    expect(await processStripeEvent(handle.db, partial, opts)).toMatchObject({ outcome: 'refund_partial', orderId: b.id });
    expect((await row(b.id)).paymentStatus).toBe('paid');
    expect(await eventTypes(b.id)).toContain('partial_refund');
  });

  it('charge.dispute.created records the dispute and alerts the admin', async () => {
    const o = await order();
    await processStripeEvent(handle.db, succeeded(o), opts);
    await handle.db.delete(realtimeEvents);
    expect(await processStripeEvent(handle.db, disputeEvent({ piId: o.piId, amount: TOTAL }), opts)).toMatchObject({
      outcome: 'dispute_recorded',
      orderId: o.id,
    });
    expect(await eventTypes(o.id)).toContain('dispute_created');
    const [alert] = await handle.db.select().from(realtimeEvents);
    expect(alert).toMatchObject({ kind: 'order.updated', orderId: o.id });
    expect(alert!.data).toMatchObject({ dispute: { reason: 'fraudulent', amountCents: TOTAL } });
    expect(await row(o.id)).toMatchObject({ status: 'new', paymentStatus: 'paid' });
  });

  it('unknown event types are recorded as ignored', async () => {
    const event = { id: evtId(), object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } } };
    expect(await processStripeEvent(handle.db, event, opts)).toEqual({ outcome: 'ignored', orderPaid: false });
    const [recorded] = await handle.db.select().from(paymentEvents);
    expect(recorded).toMatchObject({ id: event.id, outcome: 'ignored', orderId: null });
  });

  it('labels mock events with the mock provider', async () => {
    const o = await order();
    await processStripeEvent(handle.db, succeeded(o, { id: 'evt_mock_abc' }), opts);
    const [recorded] = await handle.db.select().from(paymentEvents);
    expect(recorded!.provider).toBe('mock');
  });
});
