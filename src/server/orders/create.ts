import { randomBytes } from 'node:crypto';
import { and, eq, gt, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { business } from '@/config/business';
import type { Db, Tx } from '@/db/client';
import { type OrderRow, orderEvents, orderItems, orders } from '@/db/schema';
import type { CartLineInput } from '@/domain/cart';
import type { Catalog } from '@/domain/catalog';
import { type PricedCart, PricingError, priceCart } from '@/domain/pricing';
import { type SlotRules, toSlotKey, validateSlot } from '@/domain/slots';
import { loadCatalog } from '@/server/catalog';
import { loadSettings, toSlotRules } from '@/server/settings';
import { CheckoutError, type PriceMismatchCart } from './errors';
import type { CheckoutInput } from './input';
import type { PaymentProviderId } from './types';

/** Orders whose pizzas occupy oven capacity regardless of time: paid and not cancelled. */
const CAPACITY_STATUSES = ['new', 'preparing', 'ready', 'completed'] as const;

export interface CreatePendingOrderOptions {
  now?: Date;
  provider: PaymentProviderId;
  /** How long the unpaid order holds its slot (default business.defaults.pendingHoldMinutes). */
  holdMinutes?: number;
}

export interface PendingOrder {
  id: string;
  number: number;
  publicToken: string;
  status: OrderRow['status'];
  totalCents: number;
  currency: string;
  pickupAt: string;
  customerEmail: string;
  paymentProvider: string;
  /** null until `attachPaymentIntent`. */
  paymentIntentId: string | null;
}

export interface CreatePendingOrderResult {
  order: PendingOrder;
  /** true when an earlier request with the same clientRequestId already created this order. */
  reused: boolean;
}

const toPending = (row: OrderRow): PendingOrder => ({
  id: row.id,
  number: row.number,
  publicToken: row.publicToken,
  status: row.status,
  totalCents: row.totalCents,
  currency: row.currency,
  pickupAt: row.pickupAt.toISOString(),
  customerEmail: row.customerEmail,
  paymentProvider: row.paymentProvider,
  paymentIntentId: row.paymentIntentId,
});

/** Takes a transaction-scoped advisory lock (released at commit/rollback). Works on Postgres and PGlite. */
export async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

/**
 * Pizzas already booked per slot (keyed by `toSlotKey`): paid, non-cancelled orders plus unpaid orders whose
 * reservation is still live at `now`. Only slots in the bookable window (`rules.maxDaysAhead`) are returned.
 */
export async function loadSlotLoad(db: Db | Tx, now: Date, rules: Pick<SlotRules, 'maxDaysAhead'>): Promise<Record<string, number>> {
  const from = new Date(now.getTime() - 24 * 3_600_000);
  const to = new Date(now.getTime() + (rules.maxDaysAhead + 2) * 24 * 3_600_000);
  const rows = await db
    .select({ pickupAt: orders.pickupAt, pizzas: sql<number>`coalesce(sum(${orders.pizzaCount}), 0)`.mapWith(Number) })
    .from(orders)
    .where(
      and(
        gte(orders.pickupAt, from),
        lte(orders.pickupAt, to),
        or(
          inArray(orders.status, [...CAPACITY_STATUSES]),
          and(eq(orders.status, 'awaiting_payment'), gt(orders.reservationExpiresAt, now)),
        ),
      ),
    )
    .groupBy(orders.pickupAt);

  const load: Record<string, number> = {};
  for (const row of rows) {
    if (row.pizzas > 0) load[toSlotKey(row.pickupAt)] = (load[toSlotKey(row.pickupAt)] ?? 0) + row.pizzas;
  }
  return load;
}

function mapPricingError(error: PricingError): CheckoutError {
  switch (error.code) {
    case 'ITEM_UNAVAILABLE':
    case 'UNKNOWN_SIZE':
    case 'UNKNOWN_DOUGH':
    case 'UNKNOWN_SAUCE':
    case 'UNKNOWN_INGREDIENT':
    case 'UNKNOWN_MENU_PIZZA':
    case 'UNKNOWN_PRODUCT':
      return new CheckoutError('ITEM_UNAVAILABLE', error.slug ? { slug: error.slug } : {});
    default:
      return new CheckoutError('INVALID_CART', error.slug ? { slug: error.slug } : {});
  }
}

export function priceMismatchCart(cart: PricedCart): PriceMismatchCart {
  return {
    lines: cart.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents })),
    totalCents: cart.totalCents,
  };
}

function sameRequest(existing: OrderRow, input: CheckoutInput): boolean {
  return (
    existing.totalCents === input.expectedTotalCents &&
    existing.pickupAt.getTime() === new Date(input.pickupAt).getTime() &&
    existing.customerEmail === input.customer.email
  );
}

async function findByRequestId(db: Db | Tx, clientRequestId: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.clientRequestId, clientRequestId));
  return row;
}

function reuse(existing: OrderRow, input: CheckoutInput): CreatePendingOrderResult {
  if (!sameRequest(existing, input)) throw new CheckoutError('IDEMPOTENCY_CONFLICT');
  if ((existing.status === 'expired' || existing.status === 'cancelled') && existing.paymentStatus !== 'paid') {
    throw new CheckoutError('IDEMPOTENCY_CONFLICT', {}, 'La prenotazione è scaduta: ricarica la pagina e conferma di nuovo l’ordine.');
  }
  return { order: toPending(existing), reused: true };
}

function randomSeed(): string {
  return randomBytes(6).toString('hex');
}

function layoutSeed(line: CartLineInput, catalog: Catalog): string | null {
  if (line.type !== 'pizza') return null;
  if (line.pizza.seed) return line.pizza.seed;
  const menu = line.pizza.menuSlug ? catalog.menuPizzas.find((p) => p.slug === line.pizza.menuSlug) : undefined;
  return menu?.seed ?? randomSeed();
}

/**
 * Creates an unpaid order that holds its pickup slot for `holdMinutes`.
 *
 * Never trusts client prices: the cart is re-priced from the database and must equal `expectedTotalCents`.
 * Capacity is checked under a per-slot advisory lock inside the same transaction as the insert, so concurrent
 * checkouts can never overbook a slot. Idempotent on `clientRequestId`.
 *
 * @throws CheckoutError (IDEMPOTENCY_CONFLICT | SHOP_CLOSED | ITEM_UNAVAILABLE | INVALID_CART | PRICE_MISMATCH | SLOT_UNAVAILABLE)
 */
export async function createPendingOrder(db: Db, input: CheckoutInput, options: CreatePendingOrderOptions): Promise<CreatePendingOrderResult> {
  const now = options.now ?? new Date();
  const holdMinutes = options.holdMinutes ?? business.defaults.pendingHoldMinutes;

  const existing = await findByRequestId(db, input.clientRequestId);
  if (existing) return reuse(existing, input);

  const [settings, catalog] = await Promise.all([loadSettings(db), loadCatalog(db)]);
  if (!settings.shopOpen && !settings.reopenAt) {
    throw new CheckoutError('SHOP_CLOSED', { closedMessage: settings.closedMessage }, settings.closedMessage || undefined);
  }

  let priced: PricedCart;
  try {
    priced = priceCart(catalog, input.cart);
  } catch (error) {
    if (error instanceof PricingError) throw mapPricingError(error);
    throw error;
  }
  if (priced.totalCents !== input.expectedTotalCents) {
    throw new CheckoutError('PRICE_MISMATCH', {
      expectedTotalCents: input.expectedTotalCents,
      computedTotalCents: priced.totalCents,
      cart: priceMismatchCart(priced),
    });
  }

  const rules = toSlotRules(settings);
  const pickupAt = new Date(input.pickupAt);
  const slotKey = Number.isNaN(pickupAt.getTime()) ? input.pickupAt : toSlotKey(pickupAt);

  return db.transaction(async (tx) => {
    // Lock order: request id, then slot. Every caller takes them in this order, so no deadlock.
    await advisoryLock(tx, `checkout:${input.clientRequestId}`);
    const raced = await findByRequestId(tx, input.clientRequestId);
    if (raced) return reuse(raced, input);

    await advisoryLock(tx, `slot:${slotKey}`);
    const load = await loadSlotLoad(tx, now, rules);
    const slot = validateSlot({ now, rules, load, pizzaCount: priced.pizzaCount, startIso: input.pickupAt });
    if (!slot.ok) throw new CheckoutError('SLOT_UNAVAILABLE', { reason: slot.reason });

    const [order] = await tx
      .insert(orders)
      .values({
        publicToken: randomBytes(18).toString('base64url'),
        clientRequestId: input.clientRequestId,
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email,
        notes: input.notes ?? null,
        pickupAt: new Date(slot.slot.startIso),
        pizzaCount: priced.pizzaCount,
        totalCents: priced.totalCents,
        currency: 'eur',
        paymentProvider: options.provider,
        reservationExpiresAt: new Date(now.getTime() + holdMinutes * 60_000),
        termsAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(orderItems).values(
      priced.lines.map((line, position) => ({
        orderId: order!.id,
        position,
        kind: line.type,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
        config: line.snapshot,
        layoutSeed: layoutSeed(input.cart[position]!, catalog),
        allergens: line.allergens,
        notes: line.notes ?? null,
      })),
    );

    await tx.insert(orderEvents).values({
      orderId: order!.id,
      type: 'created',
      toStatus: 'awaiting_payment',
      actor: 'system',
      data: { totalCents: priced.totalCents, pizzaCount: priced.pizzaCount, provider: options.provider },
      createdAt: now,
    });

    return { order: toPending(order!), reused: false };
  });
}

/** Links the PaymentIntent to the order. Returns false when the order does not exist. */
export async function attachPaymentIntent(db: Db | Tx, orderId: string, paymentIntentId: string): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ paymentIntentId, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });
  return updated.length > 0;
}
