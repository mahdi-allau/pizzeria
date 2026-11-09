import { and, asc, eq, lt } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import { type OrderRow, orderEvents, orders } from '@/db/schema';
import { type Actor, type OrderStatus, STATUS_FLOW, isPaidStatus, transition } from '@/domain/order-status';
import { publishEvent } from '@/server/realtime';
import type { PaymentProvider } from '@/server/payments/types';
import { OrderNotFoundError, OrderStateError } from './errors';
import { itemsByOrder, toSummary } from './mappers';
import type { OrderSummary } from './types';

/**
 * Order lifecycle. Every function locks the order row (`SELECT … FOR UPDATE`) inside a transaction, so concurrent
 * webhook deliveries and kitchen clicks are serialised per order; every change writes an `order_events` row and
 * the realtime event in the same transaction (a rolled-back change never notifies anyone).
 *
 * The `…Tx` variants run inside a caller's transaction (the Stripe webhook uses them next to its idempotency barrier).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrderRef {
  orderId?: string | null;
  paymentIntentId?: string | null;
}

/** Locks and returns the order matching `orderId` (preferred) or `paymentIntentId`; undefined when none. */
export async function lockOrder(tx: Tx, ref: OrderRef): Promise<OrderRow | undefined> {
  if (ref.orderId && UUID.test(ref.orderId)) {
    const [row] = await tx.select().from(orders).where(eq(orders.id, ref.orderId)).for('update');
    if (row) return row;
  }
  if (ref.paymentIntentId) {
    const [row] = await tx.select().from(orders).where(eq(orders.paymentIntentId, ref.paymentIntentId)).for('update');
    if (row) return row;
  }
  return undefined;
}

export async function summaryOf(tx: Db | Tx, order: OrderRow): Promise<OrderSummary> {
  const items = await itemsByOrder(tx, [order.id]);
  return toSummary(order, items.get(order.id) ?? []);
}

/** Appends one row to the order's audit trail. */
export async function addEvent(
  tx: Tx,
  orderId: string,
  type: string,
  actor: Actor | string,
  now: Date,
  extra: { fromStatus?: string | null; toStatus?: string | null; data?: Record<string, unknown> } = {},
): Promise<void> {
  await tx.insert(orderEvents).values({
    orderId,
    type,
    actor,
    fromStatus: extra.fromStatus ?? null,
    toStatus: extra.toStatus ?? null,
    data: extra.data ?? null,
    createdAt: now,
  });
}

// ───────────────────────────── paid ─────────────────────────────

export interface MarkOrderPaidInput extends OrderRef {
  /** Amount actually received (Stripe `amount_received`). When given, it must equal the order total. */
  amountCents?: number;
  currency?: string;
  now?: Date;
  /** Extra data stored on the order event (e.g. the Stripe event id). */
  meta?: Record<string, unknown>;
}

export interface MarkOrderPaidResult {
  orderId: string;
  /** true when this call moved the order into the kitchen flow. */
  transitioned: boolean;
  status: OrderStatus;
  /** The payment had already been recorded (idempotent repeat). */
  alreadyPaid?: boolean;
  anomaly?: 'amount_mismatch' | 'paid_after_cancel';
  /** Paid after the slot hold lapsed: the order was revived from `expired` (the slot may now be over capacity). */
  lateAfterExpiry?: boolean;
  /** Money was taken for an order that will not be served. */
  needsRefund?: boolean;
}

/**
 * Records a verified payment. Idempotent and race-safe.
 *  - awaiting_payment → new (+ `paid` event, realtime `order.paid`)
 *  - expired → new, flagged `lateAfterExpiry` (deliberate exception to the state machine: the customer has paid)
 *  - cancelled → stays cancelled, payment recorded, `paid_after_cancel` event + realtime `order.updated` {needsRefund}
 *  - already paid / refunded → no change
 *  - amount or currency different from the order → NOT marked paid, `payment_amount_mismatch` event
 * @throws OrderNotFoundError
 */
export async function markOrderPaidTx(tx: Tx, input: MarkOrderPaidInput): Promise<MarkOrderPaidResult> {
  const now = input.now ?? new Date();
  const order = await lockOrder(tx, input);
  if (!order) throw new OrderNotFoundError(input.orderId ?? input.paymentIntentId ?? '');
  const from = order.status as OrderStatus;

  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
    return { orderId: order.id, transitioned: false, status: from, alreadyPaid: true };
  }

  const currencyOk = input.currency === undefined || input.currency.toLowerCase() === order.currency.toLowerCase();
  const amountOk = input.amountCents === undefined || input.amountCents === order.totalCents;
  if (!currencyOk || !amountOk) {
    await addEvent(tx, order.id, 'payment_amount_mismatch', 'system', now, {
      data: {
        ...input.meta,
        expectedCents: order.totalCents,
        expectedCurrency: order.currency,
        receivedCents: input.amountCents ?? null,
        receivedCurrency: input.currency ?? null,
      },
    });
    return { orderId: order.id, transitioned: false, status: from, anomaly: 'amount_mismatch' };
  }

  const paymentFields = {
    paymentStatus: 'paid' as const,
    paidAt: now,
    updatedAt: now,
    ...(order.paymentIntentId ? {} : input.paymentIntentId ? { paymentIntentId: input.paymentIntentId } : {}),
  };

  if (from === 'cancelled') {
    const [updated] = await tx.update(orders).set(paymentFields).where(eq(orders.id, order.id)).returning();
    await addEvent(tx, order.id, 'paid_after_cancel', 'system', now, { data: { ...input.meta, needsRefund: true } });
    await publishEvent(tx, 'order.updated', order.id, { ...(await summaryOf(tx, updated!)), status: 'cancelled', paymentStatus: 'paid', needsRefund: true });
    return { orderId: order.id, transitioned: false, status: 'cancelled', anomaly: 'paid_after_cancel', needsRefund: true };
  }

  let to: OrderStatus = from;
  let lateAfterExpiry = false;
  if (from === 'awaiting_payment') to = transition(from, 'new', 'system');
  else if (from === 'expired') {
    to = 'new';
    lateAfterExpiry = true;
  }

  const [updated] = await tx
    .update(orders)
    .set({ ...paymentFields, status: to, reservationExpiresAt: null })
    .where(eq(orders.id, order.id))
    .returning();
  const flags = lateAfterExpiry ? { lateAfterExpiry: true } : {};
  await addEvent(tx, order.id, 'paid', 'system', now, {
    fromStatus: from,
    toStatus: to,
    data: { ...input.meta, amountCents: order.totalCents, ...flags },
  });
  await publishEvent(tx, 'order.paid', order.id, { ...(await summaryOf(tx, updated!)), ...flags });

  return { orderId: order.id, transitioned: to !== from, status: to, ...flags };
}

export async function markOrderPaid(db: Db, input: MarkOrderPaidInput): Promise<MarkOrderPaidResult> {
  return db.transaction((tx) => markOrderPaidTx(tx, input));
}

// ───────────────────────────── payment failed ─────────────────────────────

export interface MarkPaymentFailedInput extends OrderRef {
  /** e.g. Stripe `last_payment_error.code` ("card_declined"). */
  reason?: string | null;
  now?: Date;
  meta?: Record<string, unknown>;
}

export interface MarkPaymentFailedResult {
  orderId: string;
  /** false when the order was already paid/refunded (a late failure never downgrades it). */
  recorded: boolean;
}

/** A failed attempt: paymentStatus 'failed', order stays awaiting_payment so the customer can retry. */
export async function markPaymentFailedTx(tx: Tx, input: MarkPaymentFailedInput): Promise<MarkPaymentFailedResult> {
  const now = input.now ?? new Date();
  const order = await lockOrder(tx, input);
  if (!order) throw new OrderNotFoundError(input.orderId ?? input.paymentIntentId ?? '');
  if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') return { orderId: order.id, recorded: false };

  await tx.update(orders).set({ paymentStatus: 'failed', updatedAt: now }).where(eq(orders.id, order.id));
  await addEvent(tx, order.id, 'payment_failed', 'system', now, { data: { ...input.meta, reason: input.reason ?? null } });
  return { orderId: order.id, recorded: true };
}

export async function markPaymentFailed(db: Db, input: MarkPaymentFailedInput): Promise<MarkPaymentFailedResult> {
  return db.transaction((tx) => markPaymentFailedTx(tx, input));
}

// ───────────────────────────── status changes ─────────────────────────────

const STAMP: Partial<Record<OrderStatus, 'preparingAt' | 'readyAt' | 'completedAt' | 'cancelledAt'>> = {
  preparing: 'preparingAt',
  ready: 'readyAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

export interface ChangeStatusMeta {
  now?: Date;
  /** Free text stored on the event, e.g. why an order was cancelled. */
  reason?: string;
  [key: string]: unknown;
}

export interface ChangeStatusResult {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  /** A paid order was cancelled: the money must be given back (see refundOrder). */
  needsRefund: boolean;
  summary: OrderSummary;
}

/**
 * Moves an order through the state machine (@/domain/order-status), stamping preparingAt / readyAt / completedAt /
 * cancelledAt (stepping back clears the later stamps). Publishes realtime `order.status` {…summary, from, to} for
 * orders the kitchen can see (paid ones).
 * @throws InvalidTransitionError, OrderNotFoundError
 */
export async function changeOrderStatusTx(tx: Tx, orderId: string, to: OrderStatus, actor: Actor, meta: ChangeStatusMeta = {}): Promise<ChangeStatusResult> {
  const { now = new Date(), ...data } = meta;
  const order = await lockOrder(tx, { orderId });
  if (!order) throw new OrderNotFoundError(orderId);
  const from = order.status as OrderStatus;
  transition(from, to, actor);

  const flow = STATUS_FLOW as readonly OrderStatus[];
  const cleared: Partial<Record<'preparingAt' | 'readyAt' | 'completedAt', null>> = {};
  const toIndex = flow.indexOf(to);
  if (toIndex >= 0) for (const later of flow.slice(toIndex + 1)) if (STAMP[later]) cleared[STAMP[later] as 'preparingAt'] = null;
  const stamp = STAMP[to];

  const [updated] = await tx
    .update(orders)
    .set({ status: to, updatedAt: now, ...cleared, ...(stamp ? { [stamp]: now } : {}), ...(to === 'cancelled' ? { reservationExpiresAt: null } : {}) })
    .where(eq(orders.id, orderId))
    .returning();

  const needsRefund = to === 'cancelled' && order.paymentStatus === 'paid';
  await addEvent(tx, orderId, 'status_changed', actor, now, { fromStatus: from, toStatus: to, data: { ...data, ...(needsRefund ? { needsRefund } : {}) } });

  const summary = await summaryOf(tx, updated!);
  if (order.paymentStatus === 'paid' || isPaidStatus(from)) {
    await publishEvent(tx, 'order.status', orderId, { ...summary, from, to, ...(needsRefund ? { needsRefund } : {}) });
  }
  return { orderId, from, to, needsRefund, summary };
}

export async function changeOrderStatus(db: Db, orderId: string, to: OrderStatus, actor: Actor, meta: ChangeStatusMeta = {}): Promise<ChangeStatusResult> {
  return db.transaction((tx) => changeOrderStatusTx(tx, orderId, to, actor, meta));
}

// ───────────────────────────── refunds ─────────────────────────────

/**
 * Refunds a paid order in full through the provider, then records paymentStatus 'refunded' (the later
 * `charge.refunded` webhook is then a no-op). The order status is not changed: cancel it separately if needed.
 * @throws OrderStateError('NOT_REFUNDABLE'), OrderNotFoundError, provider errors
 */
export async function refundOrder(
  db: Db,
  provider: PaymentProvider,
  orderId: string,
  options: { now?: Date; actor?: Actor } = {},
): Promise<{ refundId: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderNotFoundError(orderId);
  if (order.paymentStatus !== 'paid' || !order.paymentIntentId) {
    throw new OrderStateError('NOT_REFUNDABLE', 'Questo ordine non risulta pagato: non c’è nulla da rimborsare.');
  }

  const refund = await provider.refund(order.paymentIntentId);
  const now = options.now ?? new Date();
  await db.transaction(async (tx) => {
    const locked = await lockOrder(tx, { orderId });
    if (!locked || locked.paymentStatus === 'refunded') return;
    const [updated] = await tx.update(orders).set({ paymentStatus: 'refunded', updatedAt: now }).where(eq(orders.id, orderId)).returning();
    await addEvent(tx, orderId, 'refunded', options.actor ?? 'admin', now, { data: { refundId: refund.id, amountCents: order.totalCents } });
    await publishEvent(tx, 'order.updated', orderId, { ...(await summaryOf(tx, updated!)), status: updated!.status, paymentStatus: 'refunded' });
  });
  return { refundId: refund.id };
}

// ───────────────────────────── housekeeping ─────────────────────────────

/**
 * Expires unpaid orders whose slot hold lapsed (status → expired, actor system) and cancels their PaymentIntents
 * (best effort: a failure is ignored; if the payment succeeded meanwhile, the webhook revives the order).
 * Idempotent. Pass `provider: null` when payments are not configured.
 */
export async function expireStaleOrders(
  db: Db,
  { now = new Date(), provider }: { now?: Date; provider: PaymentProvider | null },
): Promise<{ expired: number; orderIds: string[] }> {
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, 'awaiting_payment'), lt(orders.reservationExpiresAt, now)))
    .orderBy(asc(orders.createdAt));

  const expired: { id: string; paymentIntentId: string | null }[] = [];
  for (const { id } of candidates) {
    const done = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, { orderId: id });
      if (!order || order.status !== 'awaiting_payment' || !order.reservationExpiresAt || order.reservationExpiresAt >= now) return null;
      const to = transition('awaiting_payment', 'expired', 'system');
      await tx.update(orders).set({ status: to, updatedAt: now }).where(eq(orders.id, id));
      await addEvent(tx, id, 'expired', 'system', now, { fromStatus: 'awaiting_payment', toStatus: to });
      return { id, paymentIntentId: order.paymentIntentId };
    });
    if (done) expired.push(done);
  }

  if (provider) {
    await Promise.all(
      expired
        .filter((o) => o.paymentIntentId)
        .map((o) => provider.cancelPayment(o.paymentIntentId!).catch(() => undefined)),
    );
  }
  return { expired: expired.length, orderIds: expired.map((o) => o.id) };
}
