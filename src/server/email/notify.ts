import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { business } from '@/config/business';
import type { Db } from '@/db/client';
import { emailLog, orderItems, orders } from '@/db/schema';
import { appUrl, getEnv } from '@/env';
import { loadSettings } from '@/server/settings';
import { type EmailMessage, type SendEmailResult, isValidEmailAddress, sendEmail } from './send';
import { renderCustomerReceipt, renderPizzeriaAlert } from './templates';
import type { OrderEmailData } from './types';

/**
 * Sends the customer receipt and the pizzeria "new order" alert for a paid order.
 *
 * CONTRACT
 *  - Idempotent per (orderId, kind) through the `email_log` table: the same email is never sent twice, even when
 *    `notifyOrderPaid` runs concurrently (webhook retries, a cron sweep at the same moment).
 *  - Never throws for a delivery failure, and one email failing never blocks the other. A failure is recorded in
 *    `email_log` (status `failed`, error text) and retried by the next call or by `retryFailedEmails`.
 *  - Only orders whose `paymentStatus` is `paid` get emails.
 *
 * HOW THE CLAIM WORKS
 *  `INSERT ... ON CONFLICT DO NOTHING RETURNING` takes the (orderId, kind) row atomically; whoever gets it sends.
 *  A row that already exists can be taken over only through a guarded `UPDATE`: status `failed` or `pending`, or a
 *  `sending` claim older than five minutes (its owner crashed). `attempts` counts sends *started*, so a process that
 *  dies mid-send still uses up an attempt and a poisonous email cannot loop for ever.
 *  Row status: pending | sending | sent | failed | skipped.
 */

export const EMAIL_KINDS = ['customer_receipt', 'pizzeria_alert'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** `retryFailedEmails` gives up on a row after this many attempts. */
export const MAX_ATTEMPTS = 5;
/** A `sending` claim older than this belongs to a process that died. */
export const STALE_SENDING_MS = 5 * 60_000;

const RETRY_BATCH = 25;
const ERROR_MAX_LENGTH = 500;

export interface NotifyDeps {
  /** Replaces `sendEmail` (tests, or a different transport). */
  send?: (message: EmailMessage) => Promise<SendEmailResult>;
  now?: () => Date;
  /** Public origin of the site for the links (default `APP_URL`). */
  appUrl?: string;
  /** Last-resort recipient of the alert (default `business.contact.orderNotificationEmail`). */
  alertFallbackEmail?: string;
}

type Outcome = 'sent' | 'failed' | 'skipped' | 'busy' | 'ignored';

interface LoadedOrder {
  paid: boolean;
  data: OrderEmailData;
}

const clock = (deps: NotifyDeps): Date => (deps.now ?? (() => new Date()))();

// ───────────────────────────── reading the order ─────────────────────────────

async function loadOrder(db: Db, orderId: string): Promise<LoadedOrder | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.position));
  return {
    paid: order.paymentStatus === 'paid',
    data: {
      id: order.id,
      number: order.number,
      publicToken: order.publicToken,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      pickupAt: order.pickupAt,
      totalCents: order.totalCents,
      notes: order.notes,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        notes: item.notes,
        allergens: item.allergens,
        config: item.config,
      })),
    },
  };
}

// ───────────────────────────── recipients ─────────────────────────────

/** "a@x.it, b@x.it; c@x.it" -> valid, distinct addresses. Lets the owner type several inboxes in one settings field. */
export function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,;]+/).filter(isValidEmailAddress))];
}

/** Settings first, then ORDER_NOTIFICATION_EMAIL, then the address in the business config. */
async function alertRecipients(db: Db, deps: NotifyDeps): Promise<string[]> {
  const settings = await loadSettings(db);
  const fallback = deps.alertFallbackEmail ?? business.contact.orderNotificationEmail;
  for (const candidate of [settings.notificationEmail, getEnv().ORDER_NOTIFICATION_EMAIL, fallback]) {
    const recipients = parseRecipients(candidate);
    if (recipients.length > 0) return recipients;
  }
  return [];
}

// ───────────────────────────── the email_log claim ─────────────────────────────

const ROW_KEY = [emailLog.orderId, emailLog.kind];

async function claim(db: Db, orderId: string, kind: EmailKind, toAddress: string, now: Date, maxAttempts?: number): Promise<boolean> {
  const inserted = await db
    .insert(emailLog)
    .values({ orderId, kind, toAddress, status: 'sending', attempts: 1, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: ROW_KEY })
    .returning({ id: emailLog.id });
  if (inserted.length > 0) return true;

  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  const reclaimed = await db
    .update(emailLog)
    .set({ status: 'sending', toAddress, attempts: sql`${emailLog.attempts} + 1`, updatedAt: now })
    .where(
      and(
        eq(emailLog.orderId, orderId),
        eq(emailLog.kind, kind),
        or(inArray(emailLog.status, ['failed', 'pending']), and(eq(emailLog.status, 'sending'), lt(emailLog.updatedAt, staleBefore))),
        ...(maxAttempts === undefined ? [] : [lt(emailLog.attempts, maxAttempts)]),
      ),
    )
    .returning({ id: emailLog.id });
  return reclaimed.length > 0;
}

const ownRow = (orderId: string, kind: EmailKind) => and(eq(emailLog.orderId, orderId), eq(emailLog.kind, kind));

async function markSent(db: Db, orderId: string, kind: EmailKind, result: SendEmailResult, now: Date): Promise<void> {
  await db
    .update(emailLog)
    .set({ status: 'sent', provider: result.provider, providerId: result.id, sentAt: now, updatedAt: now, error: null })
    .where(and(ownRow(orderId, kind), eq(emailLog.status, 'sending')));
}

async function markFailed(db: Db, orderId: string, kind: EmailKind, error: string, now: Date): Promise<void> {
  await db
    .update(emailLog)
    .set({ status: 'failed', error, updatedAt: now })
    .where(and(ownRow(orderId, kind), eq(emailLog.status, 'sending')));
}

/** Nothing will be sent for this (order, kind): record why, unless a send already happened or is in progress. */
async function recordSkipped(db: Db, orderId: string, kind: EmailKind, reason: string, now: Date): Promise<void> {
  const inserted = await db
    .insert(emailLog)
    .values({ orderId, kind, toAddress: '', status: 'skipped', error: reason, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: ROW_KEY })
    .returning({ id: emailLog.id });
  if (inserted.length === 0) await skipOpenRow(db, orderId, kind, reason, now);
}

/** Closes a row that was waiting for a retry (pending or failed); never touches `sent` or `sending`. */
async function skipOpenRow(db: Db, orderId: string, kind: EmailKind, reason: string, now: Date): Promise<void> {
  await db
    .update(emailLog)
    .set({ status: 'skipped', error: reason, updatedAt: now })
    .where(and(ownRow(orderId, kind), inArray(emailLog.status, ['pending', 'failed'])));
}

function errorText(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const prefix = typeof code === 'string' ? `[${code}] ` : '';
  return `${prefix}${error instanceof Error ? error.message : String(error)}`.slice(0, ERROR_MAX_LENGTH);
}

// ───────────────────────────── sending one email ─────────────────────────────

function buildMessage(kind: EmailKind, order: OrderEmailData, recipients: string[], deps: NotifyDeps): EmailMessage {
  const options = { now: clock(deps), appUrl: deps.appUrl ?? appUrl() };
  const rendered = kind === 'customer_receipt' ? renderCustomerReceipt(order, options) : renderPizzeriaAlert(order, options);
  // Replies to the receipt reach the pizzeria; replies to the alert reach the customer.
  const replyTo = kind === 'customer_receipt' ? business.contact.email : order.customerEmail.trim();
  return {
    to: recipients.length === 1 ? recipients[0]! : recipients,
    ...rendered,
    ...(isValidEmailAddress(replyTo) ? { replyTo } : {}),
    kind,
    tags: [
      { name: 'kind', value: kind },
      { name: 'order', value: String(order.number) },
    ],
    // If a send is repeated after a crash, Resend drops the duplicate (24 h window).
    idempotencyKey: `${order.id}:${kind}`,
  };
}

async function deliver(db: Db, orderId: string, kind: EmailKind, loaded: LoadedOrder | null, deps: NotifyDeps, maxAttempts?: number): Promise<Outcome> {
  if (!loaded || !loaded.paid) {
    await skipOpenRow(db, orderId, kind, loaded ? 'order is not paid' : 'order not found', clock(deps));
    return 'ignored';
  }
  const order = loaded.data;

  let recipients: string[];
  if (kind === 'customer_receipt') {
    const address = order.customerEmail.trim();
    recipients = isValidEmailAddress(address) ? [address] : [];
  } else {
    recipients = await alertRecipients(db, deps);
  }
  if (recipients.length === 0) {
    await recordSkipped(db, orderId, kind, kind === 'customer_receipt' ? 'invalid customer email address' : 'no recipient configured', clock(deps));
    return 'skipped';
  }

  if (!(await claim(db, orderId, kind, recipients.join(', '), clock(deps), maxAttempts))) return 'busy';

  let result: SendEmailResult;
  try {
    result = await (deps.send ?? sendEmail)(buildMessage(kind, order, recipients, deps));
  } catch (error) {
    await markFailed(db, orderId, kind, errorText(error), clock(deps));
    return 'failed';
  }
  await markSent(db, orderId, kind, result, clock(deps));
  return 'sent';
}

// ───────────────────────────── public API ─────────────────────────────

/** Sends both emails of a paid order (see the contract above). Resolves even when something goes wrong; it logs instead. */
export async function notifyOrderPaid(db: Db, orderId: string, deps: NotifyDeps = {}): Promise<void> {
  try {
    const loaded = await loadOrder(db, orderId);
    await Promise.all(
      EMAIL_KINDS.map((kind) =>
        deliver(db, orderId, kind, loaded, deps).catch((error: unknown) => {
          console.error(`[email] ${kind} for order ${orderId} failed unexpectedly`, error);
        }),
      ),
    );
  } catch (error) {
    console.error('[email] notifyOrderPaid failed', { orderId, error });
  }
}

/**
 * Cron job: sends again the emails that are `failed` or `pending`, or stuck in `sending` for more than five minutes,
 * up to `MAX_ATTEMPTS` attempts each (25 rows per run, oldest first). Returns how many were sent in this run.
 * A failing email only costs an attempt; a database error propagates so the cron job can report it.
 */
export async function retryFailedEmails(db: Db, deps: NotifyDeps = {}): Promise<number> {
  const staleBefore = new Date(clock(deps).getTime() - STALE_SENDING_MS);
  const rows = await db
    .select({ orderId: emailLog.orderId, kind: emailLog.kind })
    .from(emailLog)
    .where(
      and(
        inArray(emailLog.kind, [...EMAIL_KINDS]),
        lt(emailLog.attempts, MAX_ATTEMPTS),
        or(inArray(emailLog.status, ['failed', 'pending']), and(eq(emailLog.status, 'sending'), lt(emailLog.updatedAt, staleBefore))),
      ),
    )
    .orderBy(asc(emailLog.createdAt))
    .limit(RETRY_BATCH);

  const orderCache = new Map<string, Promise<LoadedOrder | null>>();
  let sent = 0;
  for (const row of rows) {
    const kind = row.kind as EmailKind;
    try {
      if (!orderCache.has(row.orderId)) orderCache.set(row.orderId, loadOrder(db, row.orderId));
      const loaded = await orderCache.get(row.orderId)!;
      if ((await deliver(db, row.orderId, kind, loaded, deps, MAX_ATTEMPTS)) === 'sent') sent++;
    } catch (error) {
      console.error(`[email] retry of ${kind} for order ${row.orderId} failed unexpectedly`, error);
    }
  }
  return sent;
}
