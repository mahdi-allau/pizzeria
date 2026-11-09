import { randomBytes } from 'node:crypto';

/** Builders for Stripe-shaped webhook events (only the fields our handler reads, plus the envelope). */

export const evtId = () => `evt_test_${randomBytes(8).toString('hex')}`;

interface PiOptions {
  id?: string;
  piId: string;
  orderId?: string | null;
  amount?: number;
  currency?: string;
  failureCode?: string;
}

export function paymentIntentEvent(type: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'payment_intent.canceled', o: PiOptions) {
  return {
    id: o.id ?? evtId(),
    object: 'event' as const,
    type,
    created: 1_794_000_000,
    livemode: false,
    data: {
      object: {
        id: o.piId,
        object: 'payment_intent',
        amount: o.amount ?? 0,
        amount_received: type === 'payment_intent.succeeded' ? (o.amount ?? 0) : 0,
        currency: o.currency ?? 'eur',
        metadata: o.orderId ? { orderId: o.orderId } : {},
        status: type === 'payment_intent.succeeded' ? 'succeeded' : type === 'payment_intent.canceled' ? 'canceled' : 'requires_payment_method',
        ...(o.failureCode ? { last_payment_error: { code: o.failureCode, message: 'Your card was declined.' } } : {}),
      },
    },
  };
}

export function chargeRefundedEvent(o: { piId: string; amount: number; refunded?: boolean; amountRefunded?: number }) {
  return {
    id: evtId(),
    object: 'event' as const,
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_1',
        object: 'charge',
        payment_intent: o.piId,
        amount: o.amount,
        amount_refunded: o.amountRefunded ?? o.amount,
        refunded: o.refunded ?? true,
        currency: 'eur',
        metadata: {},
      },
    },
  };
}

export function disputeEvent(o: { piId: string; amount: number }) {
  return {
    id: evtId(),
    object: 'event' as const,
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_1', object: 'dispute', payment_intent: o.piId, charge: 'ch_1', amount: o.amount, reason: 'fraudulent', currency: 'eur' } },
  };
}
