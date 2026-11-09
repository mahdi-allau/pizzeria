import type { AllergenCode } from '@/domain/allergens';
import type { Actor, OrderStatus } from '@/domain/order-status';
import type { PizzaSnapshot, ProductSnapshot } from '@/domain/pricing';

/**
 * Plain, JSON-friendly DTOs returned by the order services. Every instant is an ISO-8601 UTC string (or null);
 * format it in Europe/Rome at the edge. Money is integer cents. Safe to pass straight to `Response.json` or to
 * client components.
 */

export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';
export type PaymentProviderId = 'stripe' | 'mock';

/** Compact order description used in realtime events and lists (what the kitchen board needs at a glance). */
export interface OrderSummary {
  id: string;
  number: number;
  pickupAt: string;
  customerName: string;
  pizzaCount: number;
  totalCents: number;
  /** One string per line, e.g. "2× Margherita (Media)", "1× Coca-Cola". */
  itemsSummary: string[];
}

/** Row of the admin order list. */
export interface OrderListItem extends OrderSummary {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerPhone: string;
  customerEmail: string;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface OrderItemDto {
  id: string;
  position: number;
  kind: 'pizza' | 'product';
  /** Frozen display name. */
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Frozen description of exactly what was ordered (size, dough, sauce, ingredients with portions, removed...). */
  config: PizzaSnapshot | ProductSnapshot;
  /** Seed to redraw the pizza identically (null for products). */
  layoutSeed: string | null;
  allergens: AllergenCode[];
  notes: string | null;
}

export interface OrderEventDto {
  id: number;
  /** e.g. created, paid, status_changed, payment_failed, payment_amount_mismatch, paid_after_cancel, refunded, dispute_created, expired. */
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: Actor | string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

/** Everything about one order (admin detail page, kitchen ticket). */
export interface OrderDetails extends OrderListItem {
  publicToken: string;
  currency: string;
  paymentProvider: PaymentProviderId | string;
  paymentIntentId: string | null;
  reservationExpiresAt: string | null;
  termsAcceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: OrderItemDto[];
  /** Oldest first. */
  events: OrderEventDto[];
}

/** Live-board card: list row + full items (the kitchen needs the configuration of every pizza). */
export interface BoardOrder extends OrderListItem {
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  items: OrderItemDto[];
}

/** What the public status page may see (no email, no phone, first name only). */
export interface PublicOrderStatus {
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pickupAt: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  customerFirstName: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
}

export interface ListOrdersQuery {
  statuses?: OrderStatus[];
  /** Inclusive lower bound on pickupAt. */
  pickupFrom?: Date;
  /** Exclusive upper bound on pickupAt. */
  pickupTo?: Date;
  /** Matches order number (exact, digits only), or name / phone / email (case-insensitive substring). */
  search?: string;
  /** Default 50, max 200. */
  limit?: number;
  offset?: number;
}

export interface ListOrdersResult {
  /** Newest pickup first. */
  orders: OrderListItem[];
  /** Total matching rows (for pagination). */
  total: number;
}
