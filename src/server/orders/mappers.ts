import { asc, inArray } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import { type OrderItemRow, type OrderRow, orderEvents, orderItems } from '@/db/schema';
import type { OrderStatus } from '@/domain/order-status';
import type { OrderEventDto, OrderItemDto, OrderListItem, OrderSummary, PaymentStatus } from './types';

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function itemSummary(item: Pick<OrderItemRow, 'quantity' | 'name' | 'config'>): string {
  const size = item.config.type === 'pizza' ? ` (${item.config.size.name})` : '';
  return `${item.quantity}× ${item.name}${size}`;
}

export function toItemDto(row: OrderItemRow): OrderItemDto {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    lineTotalCents: row.lineTotalCents,
    config: row.config,
    layoutSeed: row.layoutSeed,
    allergens: row.allergens,
    notes: row.notes,
  };
}

export function toEventDto(row: typeof orderEvents.$inferSelect): OrderEventDto {
  return {
    id: row.id,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    actor: row.actor,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSummary(order: OrderRow, items: Pick<OrderItemRow, 'quantity' | 'name' | 'config'>[]): OrderSummary {
  return {
    id: order.id,
    number: order.number,
    pickupAt: order.pickupAt.toISOString(),
    customerName: order.customerName,
    pizzaCount: order.pizzaCount,
    totalCents: order.totalCents,
    itemsSummary: items.map(itemSummary),
  };
}

export function toListItem(order: OrderRow, items: Pick<OrderItemRow, 'quantity' | 'name' | 'config'>[]): OrderListItem {
  return {
    ...toSummary(order, items),
    status: order.status as OrderStatus,
    paymentStatus: order.paymentStatus as PaymentStatus,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    paidAt: iso(order.paidAt),
  };
}

/** Items of several orders in one query, grouped by order id, in position order. */
export async function itemsByOrder(db: Db | Tx, orderIds: string[]): Promise<Map<string, OrderItemRow[]>> {
  const grouped = new Map<string, OrderItemRow[]>(orderIds.map((id) => [id, []]));
  if (orderIds.length === 0) return grouped;
  const rows = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).orderBy(asc(orderItems.position));
  for (const row of rows) grouped.get(row.orderId)?.push(row);
  return grouped;
}
