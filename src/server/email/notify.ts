import type { Db } from '@/db/client';

/**
 * Sends the customer receipt and the pizzeria "new order" alert for a paid order.
 * CONTRACT: idempotent per (orderId, kind) via the `email_log` table — calling it twice never sends twice,
 * and a failed send is recorded and retried on the next call. Never throws for a delivery failure.
 *
 * ⚠ Placeholder: the email module replaces this body (templates, Resend, dev mailbox).
 */
export async function notifyOrderPaid(_db: Db, _orderId: string): Promise<void> {
  // implemented by the email module
}
