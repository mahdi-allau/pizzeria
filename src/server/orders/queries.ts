import { type SQL, and, asc, count, desc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { orderEvents, orders } from '@/db/schema';
import { ORDER_STATUSES, type OrderStatus } from '@/domain/order-status';
import { iso, itemsByOrder, toEventDto, toItemDto, toListItem } from './mappers';
import type { BoardOrder, ListOrdersQuery, ListOrdersResult, OrderDetails, PaymentStatus, PublicOrderStatus } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How long a collected order stays on the live board. */
export const BOARD_COMPLETED_WINDOW_MS = 4 * 3_600_000;

/** Public status page data for the unguessable token, or null. Never exposes email or phone. */
export async function getOrderByToken(db: Db, token: string): Promise<PublicOrderStatus | null> {
  const [order] = await db.select().from(orders).where(eq(orders.publicToken, token));
  if (!order) return null;
  const items = (await itemsByOrder(db, [order.id])).get(order.id) ?? [];
  return {
    number: order.number,
    status: order.status as OrderStatus,
    paymentStatus: order.paymentStatus as PaymentStatus,
    pickupAt: order.pickupAt.toISOString(),
    totalCents: order.totalCents,
    createdAt: order.createdAt.toISOString(),
    paidAt: iso(order.paidAt),
    preparingAt: iso(order.preparingAt),
    readyAt: iso(order.readyAt),
    completedAt: iso(order.completedAt),
    customerFirstName: order.customerName.trim().split(/\s+/)[0] ?? '',
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
  };
}

/** Full order (items with frozen config, event trail oldest first), or null. */
export async function getOrderDetails(db: Db, orderId: string): Promise<OrderDetails | null> {
  if (!UUID.test(orderId)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const [items, events] = await Promise.all([
    itemsByOrder(db, [order.id]).then((m) => m.get(order.id) ?? []),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.id)),
  ]);
  return {
    ...toListItem(order, items),
    publicToken: order.publicToken,
    currency: order.currency,
    paymentProvider: order.paymentProvider,
    paymentIntentId: order.paymentIntentId,
    reservationExpiresAt: iso(order.reservationExpiresAt),
    termsAcceptedAt: iso(order.termsAcceptedAt),
    preparingAt: iso(order.preparingAt),
    readyAt: iso(order.readyAt),
    completedAt: iso(order.completedAt),
    cancelledAt: iso(order.cancelledAt),
    updatedAt: order.updatedAt.toISOString(),
    items: items.map(toItemDto),
    events: events.map(toEventDto),
  };
}

/** Kitchen live board: new / preparing / ready, plus orders completed in the last 4 hours; earliest pickup first. */
export async function listBoardOrders(db: Db, { now = new Date() }: { now?: Date } = {}): Promise<BoardOrder[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      or(
        inArray(orders.status, ['new', 'preparing', 'ready']),
        and(eq(orders.status, 'completed'), gte(orders.completedAt, new Date(now.getTime() - BOARD_COMPLETED_WINDOW_MS))),
      ),
    )
    .orderBy(asc(orders.pickupAt), asc(orders.number));
  const items = await itemsByOrder(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((order) => {
    const own = items.get(order.id) ?? [];
    return {
      ...toListItem(order, own),
      preparingAt: iso(order.preparingAt),
      readyAt: iso(order.readyAt),
      completedAt: iso(order.completedAt),
      items: own.map(toItemDto),
    };
  });
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Admin order history with filters and pagination; newest pickup first. */
export async function listOrders(db: Db, query: ListOrdersQuery = {}): Promise<ListOrdersResult> {
  const limit = Math.min(Math.max(1, Math.trunc(query.limit ?? 50)), 200);
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));

  const conditions: SQL[] = [];
  if (query.statuses?.length) conditions.push(inArray(orders.status, query.statuses));
  if (query.pickupFrom) conditions.push(gte(orders.pickupAt, query.pickupFrom));
  if (query.pickupTo) conditions.push(lt(orders.pickupAt, query.pickupTo));
  const search = query.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const matches: SQL[] = [ilike(orders.customerName, pattern), ilike(orders.customerPhone, pattern), ilike(orders.customerEmail, pattern)];
    if (/^\d{1,9}$/.test(search)) matches.push(eq(orders.number, Number(search)));
    conditions.push(or(...matches)!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.pickupAt), desc(orders.number)).limit(limit).offset(offset),
    db.select({ n: count() }).from(orders).where(where),
  ]);
  const items = await itemsByOrder(
    db,
    rows.map((r) => r.id),
  );
  return { orders: rows.map((o) => toListItem(o, items.get(o.id) ?? [])), total: totalRow?.n ?? 0 };
}

/** Number of orders per status (every status present, zero included). */
export async function countByStatus(db: Db): Promise<Record<OrderStatus, number>> {
  const rows = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  const result = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const row of rows) result[row.status as OrderStatus] = row.n;
  return result;
}
