import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// NB: relative imports only in src/db — drizzle-kit loads this file without the "@/" alias.
import type { AllergenCode } from '../domain/allergens';
import type { IngredientCategory, ProductCategory } from '../domain/catalog';
import { ORDER_STATUSES } from '../domain/order-status';
import type { PizzaSnapshot, ProductSnapshot } from '../domain/pricing';
import type { WeeklyHours } from '../domain/slots';

const tz = { withTimezone: true, mode: 'date' } as const;
const emptyTextArray = sql`'{}'::text[]`;

// ───────────────────────────── enums ─────────────────────────────

export const ingredientCategoryEnum = pgEnum('ingredient_category', ['cheese', 'cured', 'veg', 'fish', 'extra']);
export const productCategoryEnum = pgEnum('product_category', ['drink', 'side', 'dessert']);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid', 'failed', 'refunded']);
export const orderItemKindEnum = pgEnum('order_item_kind', ['pizza', 'product']);

// ───────────────────────────── settings (single row) ─────────────────────────────

export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    hours: jsonb('hours').$type<WeeklyHours>().notNull(),
    prepMinutes: integer('prep_minutes').notNull(),
    slotMinutes: integer('slot_minutes').notNull().default(15),
    /** Max pizzas per slot. */
    slotCapacity: integer('slot_capacity').notNull(),
    maxDaysAhead: integer('max_days_ahead').notNull(),
    /** false = temporarily closed. */
    shopOpen: boolean('shop_open').notNull().default(true),
    closedMessage: text('closed_message'),
    /** While closed, slots at/after this instant are bookable again. */
    reopenAt: timestamp('reopen_at', tz),
    closedDates: jsonb('closed_dates').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    notificationEmail: text('notification_email'),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [check('settings_singleton', sql`${t.id} = 1`)],
);

// ───────────────────────────── catalog ─────────────────────────────

export const sizes = pgTable('sizes', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  diameterCm: integer('diameter_cm').notNull(),
  basePriceCents: integer('base_price_cents').notNull(),
  toppingPricePct: integer('topping_price_pct').notNull().default(100),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const doughs = pgTable('doughs', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  surchargeCents: integer('surcharge_cents').notNull().default(0),
  allergens: text('allergens').array().$type<AllergenCode[]>().notNull().default(emptyTextArray),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  available: boolean('available').notNull().default(true),
});

export const sauces = pgTable('sauces', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  surchargeCents: integer('surcharge_cents').notNull().default(0),
  allergens: text('allergens').array().$type<AllergenCode[]>().notNull().default(emptyTextArray),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  available: boolean('available').notNull().default(true),
});

export const ingredients = pgTable(
  'ingredients',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    category: ingredientCategoryEnum('category').$type<IngredientCategory>().notNull(),
    priceCents: integer('price_cents').notNull(),
    maxPortions: integer('max_portions').notNull().default(2),
    allergens: text('allergens').array().$type<AllergenCode[]>().notNull().default(emptyTextArray),
    vegetarian: boolean('vegetarian').notNull().default(false),
    vegan: boolean('vegan').notNull().default(false),
    spicy: boolean('spicy').notNull().default(false),
    afterBake: boolean('after_bake').notNull().default(false),
    available: boolean('available').notNull().default(true),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [check('ingredients_price_nonneg', sql`${t.priceCents} >= 0`), check('ingredients_portions', sql`${t.maxPortions} between 1 and 3`)],
);

export const menuPizzas = pgTable('menu_pizzas', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sauceSlug: text('sauce_slug')
    .notNull()
    .references(() => sauces.slug),
  badges: text('badges').array().notNull().default(emptyTextArray),
  seed: text('seed').notNull(),
  available: boolean('available').notNull().default(true),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const menuPizzaPrices = pgTable(
  'menu_pizza_prices',
  {
    pizzaSlug: text('pizza_slug')
      .notNull()
      .references(() => menuPizzas.slug, { onDelete: 'cascade', onUpdate: 'cascade' }),
    sizeSlug: text('size_slug')
      .notNull()
      .references(() => sizes.slug),
    priceCents: integer('price_cents').notNull(),
  },
  (t) => [primaryKey({ columns: [t.pizzaSlug, t.sizeSlug] }), check('menu_price_nonneg', sql`${t.priceCents} >= 0`)],
);

export const menuPizzaIngredients = pgTable(
  'menu_pizza_ingredients',
  {
    pizzaSlug: text('pizza_slug')
      .notNull()
      .references(() => menuPizzas.slug, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ingredientSlug: text('ingredient_slug')
      .notNull()
      .references(() => ingredients.slug),
    portions: integer('portions').notNull().default(1),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.pizzaSlug, t.ingredientSlug] })],
);

export const products = pgTable('products', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: productCategoryEnum('category').$type<ProductCategory>().notNull(),
  priceCents: integer('price_cents').notNull(),
  allergens: text('allergens').array().$type<AllergenCode[]>().notNull().default(emptyTextArray),
  volumeLabel: text('volume_label'),
  available: boolean('available').notNull().default(true),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ───────────────────────────── orders ─────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-friendly number shown to customer and kitchen. */
    number: integer('number').generatedAlwaysAsIdentity({ startWith: 1001 }).unique(),
    /** Unguessable token for the public confirmation/status page. */
    publicToken: text('public_token').notNull().unique(),
    /** Idempotency key sent by the browser with the checkout request. */
    clientRequestId: text('client_request_id').unique(),
    status: orderStatusEnum('status').notNull().default('awaiting_payment'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email').notNull(),
    /** Order-level note from the customer. */
    notes: text('notes'),
    pickupAt: timestamp('pickup_at', tz).notNull(),
    pizzaCount: integer('pizza_count').notNull(),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('eur'),
    paymentProvider: text('payment_provider').notNull(),
    paymentIntentId: text('payment_intent_id').unique(),
    /** Unpaid orders hold their slot until this instant. */
    reservationExpiresAt: timestamp('reservation_expires_at', tz),
    termsAcceptedAt: timestamp('terms_accepted_at', tz),
    paidAt: timestamp('paid_at', tz),
    preparingAt: timestamp('preparing_at', tz),
    readyAt: timestamp('ready_at', tz),
    completedAt: timestamp('completed_at', tz),
    cancelledAt: timestamp('cancelled_at', tz),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [
    index('orders_pickup_idx').on(t.pickupAt),
    index('orders_status_idx').on(t.status),
    index('orders_created_idx').on(t.createdAt),
    check('orders_total_nonneg', sql`${t.totalCents} >= 0`),
    check('orders_pizza_count_nonneg', sql`${t.pizzaCount} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: orderItemKindEnum('kind').notNull(),
    /** Frozen display name (menu pizza name, "Pizza personalizzata", product name). */
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    /** Frozen description of exactly what was ordered (see PizzaSnapshot / ProductSnapshot). */
    config: jsonb('config').$type<PizzaSnapshot | ProductSnapshot>().notNull(),
    /** Seed so the pizza is drawn identically on the status page and in the admin. */
    layoutSeed: text('layout_seed'),
    allergens: text('allergens').array().$type<AllergenCode[]>().notNull().default(emptyTextArray),
    notes: text('notes'),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), check('order_items_qty', sql`${t.quantity} >= 1`)],
);

/** Append-only audit trail of everything that happens to an order. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actor: text('actor').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId)],
);

// ───────────────────────────── infrastructure ─────────────────────────────

/** Feed behind the admin's live SSE stream. Clients resume with Last-Event-ID = id. */
export const realtimeEvents = pgTable('realtime_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  orderId: uuid('order_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
});

/** Stripe event ids already processed: the idempotency barrier of the webhook. */
export const paymentEvents = pgTable('payment_events', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  orderId: uuid('order_id'),
  outcome: text('outcome').notNull(),
  receivedAt: timestamp('received_at', tz).notNull().defaultNow(),
});

export const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    toAddress: text('to_address').notNull(),
    status: text('status').notNull().default('pending'),
    provider: text('provider'),
    providerId: text('provider_id'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
    sentAt: timestamp('sent_at', tz),
  },
  // One row per (order, kind): the claim that makes sending idempotent. status: pending | sending | sent | failed | skipped.
  (t) => [uniqueIndex('email_log_order_kind_uq').on(t.orderId, t.kind)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', tz).notNull(),
  count: integer('count').notNull(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
