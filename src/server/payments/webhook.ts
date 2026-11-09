import { eq } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import { orders, paymentEvents } from '@/db/schema';
import { addEvent, changeOrderStatusTx, lockOrder, markOrderPaidTx, markPaymentFailedTx, summaryOf } from '@/server/orders/lifecycle';
import { publishEvent } from '@/server/realtime';

/**
 * The webhook core. Stripe (or the dev mock) tells us what happened to a payment; we apply it exactly once.
 *
 * Idempotency barrier: `INSERT INTO payment_events (id) … ON CONFLICT DO NOTHING RETURNING` runs in the SAME
 * transaction as the order change. A redelivery (or a concurrent duplicate, which blocks on the primary key until
 * the first commits) inserts nothing and is reported as `duplicate` — still with its orderId so the caller can
 * re-run the (idempotent) notifications.
 */

/** The parts of a Stripe `Event` we rely on (a verified `Stripe.Event` satisfies it). */
export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

export type WebhookOutcome =
  | 'paid'
  | 'already_paid'
  | 'paid_after_cancel'
  | 'amount_mismatch'
  | 'failed_recorded'
  | 'failed_ignored'
  | 'cancelled'
  | 'refunded'
  | 'refund_partial'
  | 'dispute_recorded'
  | 'unknown_order'
  | 'ignored'
  | 'duplicate';

export interface ProcessEventResult {
  outcome: WebhookOutcome;
  orderId?: string;
  /** For `duplicate`: the outcome recorded by the first delivery. */
  previousOutcome?: string;
  /** The order is (now or already) paid and alive: send / re-send the "order paid" notifications. */
  orderPaid: boolean;
  /** Paid after the slot hold lapsed (order revived from expired). */
  lateAfterExpiry?: true;
}

const PAID_OUTCOMES = new Set<string>(['paid', 'already_paid']);

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** PaymentIntent id of the event object: the object itself (payment_intent.*) or its `payment_intent` field. */
function paymentIntentIdOf(type: string, object: Obj): string | undefined {
  if (type.startsWith('payment_intent.')) return str(object.id);
  const pi = object.payment_intent;
  return str(pi) ?? str(asObj(pi).id);
}

async function apply(tx: Tx, event: StripeEventLike, now: Date): Promise<Omit<ProcessEventResult, 'orderPaid'>> {
  const object = asObj(event.data?.object);
  const ref = { orderId: str(asObj(object.metadata).orderId), paymentIntentId: paymentIntentIdOf(event.type, object) };
  const meta = { stripeEventId: event.id, paymentIntentId: ref.paymentIntentId ?? null };

  const handled = [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.refunded',
    'charge.dispute.created',
  ];
  if (!handled.includes(event.type)) return { outcome: 'ignored' };

  const order = await lockOrder(tx, ref);
  if (!order) return { outcome: 'unknown_order' };
  const orderId = order.id;

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const result = await markOrderPaidTx(tx, {
        orderId,
        paymentIntentId: ref.paymentIntentId,
        amountCents: num(object.amount_received) ?? num(object.amount),
        currency: str(object.currency),
        now,
        meta,
      });
      if (result.anomaly === 'amount_mismatch') return { outcome: 'amount_mismatch', orderId };
      if (result.anomaly === 'paid_after_cancel') return { outcome: 'paid_after_cancel', orderId };
      if (result.alreadyPaid) return { outcome: 'already_paid', orderId };
      return { outcome: 'paid', orderId, ...(result.lateAfterExpiry ? { lateAfterExpiry: true as const } : {}) };
    }

    case 'payment_intent.payment_failed': {
      const error = asObj(object.last_payment_error);
      const reason = str(error.decline_code) ?? str(error.code) ?? null;
      const result = await markPaymentFailedTx(tx, { orderId, reason, now, meta });
      return { outcome: result.recorded ? 'failed_recorded' : 'failed_ignored', orderId };
    }

    case 'payment_intent.canceled': {
      if (order.status !== 'awaiting_payment' || order.paymentStatus === 'paid') return { outcome: 'ignored', orderId };
      await changeOrderStatusTx(tx, orderId, 'cancelled', 'system', { now, reason: 'payment_canceled', ...meta });
      return { outcome: 'cancelled', orderId };
    }

    case 'charge.refunded': {
      const amountRefunded = num(object.amount_refunded) ?? null;
      if (object.refunded !== true) {
        await addEvent(tx, orderId, 'partial_refund', 'system', now, { data: { ...meta, amountRefundedCents: amountRefunded } });
        return { outcome: 'refund_partial', orderId };
      }
      if (order.paymentStatus !== 'refunded') {
        const [updated] = await tx.update(orders).set({ paymentStatus: 'refunded', updatedAt: now }).where(eq(orders.id, orderId)).returning();
        await addEvent(tx, orderId, 'refunded', 'system', now, { data: { ...meta, amountRefundedCents: amountRefunded } });
        await publishEvent(tx, 'order.updated', orderId, { ...(await summaryOf(tx, updated!)), status: updated!.status, paymentStatus: 'refunded' });
      }
      return { outcome: 'refunded', orderId };
    }

    case 'charge.dispute.created': {
      const dispute = { id: str(object.id) ?? null, reason: str(object.reason) ?? null, amountCents: num(object.amount) ?? null };
      await addEvent(tx, orderId, 'dispute_created', 'system', now, { data: { ...meta, dispute } });
      await publishEvent(tx, 'order.updated', orderId, { ...(await summaryOf(tx, order)), status: order.status, paymentStatus: order.paymentStatus, dispute });
      return { outcome: 'dispute_recorded', orderId };
    }
  }
  return { outcome: 'ignored', orderId };
}

/**
 * Applies one verified Stripe event exactly once. Never throws for business conditions (unknown order, amount
 * mismatch, out-of-order delivery): those are recorded and reported in `outcome`, so the HTTP layer answers 200
 * and Stripe stops retrying. Infrastructure errors (DB down) do throw → 500 → Stripe retries later.
 */
export async function processStripeEvent(db: Db, event: StripeEventLike, { now = new Date() }: { now?: Date } = {}): Promise<ProcessEventResult> {
  const provider = event.id.startsWith('evt_mock_') ? 'mock' : 'stripe';
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({ id: event.id, provider, type: event.type, outcome: 'processing', receivedAt: now })
      .onConflictDoNothing({ target: paymentEvents.id })
      .returning({ id: paymentEvents.id });

    if (inserted.length === 0) {
      const [previous] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, event.id));
      return {
        outcome: 'duplicate',
        ...(previous?.orderId ? { orderId: previous.orderId } : {}),
        ...(previous ? { previousOutcome: previous.outcome } : {}),
        orderPaid: PAID_OUTCOMES.has(previous?.outcome ?? ''),
      };
    }

    const result = await apply(tx, event, now);
    await tx
      .update(paymentEvents)
      .set({ outcome: result.outcome, orderId: result.orderId ?? null })
      .where(eq(paymentEvents.id, event.id));
    return { ...result, orderPaid: PAID_OUTCOMES.has(result.outcome) };
  });
}
