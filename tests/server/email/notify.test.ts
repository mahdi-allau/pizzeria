import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbHandle } from '@/db/client';
import { emailLog, orders } from '@/db/schema';
import { MAX_ATTEMPTS, notifyOrderPaid, parseRecipients, retryFailedEmails, type NotifyDeps } from '@/server/email/notify';
import { EmailSendError, sendEmail, type EmailMessage, type SendEmailResult } from '@/server/email/send';
import { createTestDb } from '../../helpers/db';
import { setEnv, installCleanEnv } from '../auth/env';
import { NOW, insertOrder, setAlertEmail } from './db-helpers';

installCleanEnv();

let handle: DbHandle;
let db: Db;
beforeAll(async () => {
  handle = await createTestDb();
  db = handle.db;
});
afterAll(async () => {
  await handle.close();
});

const ALERT_TO = 'cucina@labrace.example';
beforeEach(async () => {
  await setAlertEmail(db, ALERT_TO);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A sender that records what it is asked to send. `fail` makes selected kinds throw. */
function recorder(options: { fail?: (message: EmailMessage) => unknown; delayMs?: number } = {}) {
  const sent: EmailMessage[] = [];
  const send = async (message: EmailMessage): Promise<SendEmailResult> => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const failure = options.fail?.(message);
    if (failure !== undefined) throw failure;
    sent.push(message);
    return { provider: 'resend', id: `re_${message.idempotencyKey}` };
  };
  const deps: NotifyDeps = { send, now: () => NOW, appUrl: 'https://pizza.example' };
  return { sent, deps };
}

const rowsOf = (orderId: string) => db.select().from(emailLog).where(eq(emailLog.orderId, orderId));
const rowOf = async (orderId: string, kind: string) => (await rowsOf(orderId)).find((r) => r.kind === kind)!;
/** A database handle that fails on first use, like a lost connection. */
const brokenDb = () =>
  new Proxy(
    {},
    {
      get() {
        throw new Error('db down');
      },
    },
  ) as unknown as Db;
const failing = (kind: string) => (message: EmailMessage) => (message.kind === kind ? new Error('Resend: boom') : undefined);

describe('notifyOrderPaid: the two emails', () => {
  it('sends the customer receipt and the pizzeria alert for a paid order', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);

    expect(sent.map((m) => m.kind).sort()).toEqual(['customer_receipt', 'pizzeria_alert']);
    const receipt = sent.find((m) => m.kind === 'customer_receipt')!;
    const alert = sent.find((m) => m.kind === 'pizzeria_alert')!;

    expect(receipt.to).toBe('mario.rossi@example.com');
    expect(receipt.subject).toBe(`Ordine n. ${order.number} confermato: ritiro oggi alle 19:30`);
    expect(receipt.html).toContain(`https://pizza.example/ordine/${order.publicToken}`);
    expect(receipt.text).toContain('Ciao Mario,');
    expect(receipt.replyTo).toBe('info@example.it');

    expect(alert.to).toBe(ALERT_TO);
    expect(alert.subject).toMatch(new RegExp(`^Nuovo ordine n\\. ${order.number}: ritiro 19:30, 4 pizze, `));
    expect(alert.html).toContain(`https://pizza.example/admin/ordini/${order.id}`);
    expect(alert.replyTo).toBe('mario.rossi@example.com');
  });

  it('describes the order from the database: items, build, allergens', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    const alert = sent.find((m) => m.kind === 'pizzeria_alert')!;
    expect(alert.text).toContain('2 × Diavola (modificata)');
    expect(alert.text).toContain('Mozzarella ×2 (+1 extra)');
    expect(alert.text).toContain('Senza: Basilico');
    expect(alert.text).toContain('ALLERGENI NELL’ORDINE: Glutine, Pesce, Latte');
  });

  it('tags each email and gives it an idempotency key so a retried send cannot arrive twice at the provider', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    for (const message of sent) {
      expect(message.idempotencyKey).toBe(`${order.id}:${message.kind}`);
      expect(message.tags).toEqual([
        { name: 'kind', value: message.kind },
        { name: 'order', value: String(order.number) },
      ]);
    }
  });

  it('records every send in email_log', async () => {
    const order = await insertOrder(db);
    const { deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);

    const receipt = await rowOf(order.id, 'customer_receipt');
    expect(receipt).toMatchObject({
      status: 'sent',
      toAddress: 'mario.rossi@example.com',
      provider: 'resend',
      providerId: `re_${order.id}:customer_receipt`,
      attempts: 1,
      error: null,
    });
    expect(receipt.sentAt).toEqual(NOW);
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'sent', toAddress: ALERT_TO, attempts: 1 });
  });
});

describe('notifyOrderPaid: exactly once', () => {
  it('a repeated call sends nothing more', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    await notifyOrderPaid(db, order.id, deps);
    await notifyOrderPaid(db, order.id, deps);
    expect(sent).toHaveLength(2);
    expect(await rowsOf(order.id)).toHaveLength(2);
  });

  it('concurrent calls send each email once (the claim is atomic)', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder({ delayMs: 25 });
    await Promise.all([notifyOrderPaid(db, order.id, deps), notifyOrderPaid(db, order.id, deps), notifyOrderPaid(db, order.id, deps)]);
    expect(sent.map((m) => m.kind).sort()).toEqual(['customer_receipt', 'pizzeria_alert']);
    expect((await rowsOf(order.id)).every((r) => r.status === 'sent' && r.attempts === 1)).toBe(true);
  });

  it('a notify and a retry running at the same time do not double-send either', async () => {
    const order = await insertOrder(db);
    await db.insert(emailLog).values({ orderId: order.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'pending' });
    const { sent, deps } = recorder({ delayMs: 25 });
    await Promise.all([notifyOrderPaid(db, order.id, deps), retryFailedEmails(db, deps)]);
    const mine = sent.filter((m) => m.idempotencyKey?.startsWith(order.id));
    expect(mine.filter((m) => m.kind === 'customer_receipt')).toHaveLength(1);
    expect(mine.filter((m) => m.kind === 'pizzeria_alert')).toHaveLength(1);
  });

  it('only sends for orders that are paid', async () => {
    for (const paymentStatus of ['unpaid', 'failed', 'refunded'] as const) {
      const order = await insertOrder(db, { paymentStatus, status: 'awaiting_payment' });
      const { sent, deps } = recorder();
      await notifyOrderPaid(db, order.id, deps);
      expect(sent).toHaveLength(0);
      expect(await rowsOf(order.id)).toHaveLength(0);
    }
  });

  it('ignores an order that does not exist', async () => {
    const { sent, deps } = recorder();
    await expect(notifyOrderPaid(db, '00000000-0000-4000-8000-000000000000', deps)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});

describe('notifyOrderPaid: failures never throw and never block the other email', () => {
  it('records a failed receipt and still sends the alert', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder({ fail: failing('customer_receipt') });
    await expect(notifyOrderPaid(db, order.id, deps)).resolves.toBeUndefined();

    expect(sent.map((m) => m.kind)).toEqual(['pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'failed', attempts: 1, error: 'Resend: boom', providerId: null });
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'sent' });
  });

  it('records a failed alert and still sends the receipt', async () => {
    const order = await insertOrder(db);
    const { sent, deps } = recorder({ fail: failing('pizzeria_alert') });
    await notifyOrderPaid(db, order.id, deps);
    expect(sent.map((m) => m.kind)).toEqual(['customer_receipt']);
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'failed' });
  });

  it('copes with a sender that throws something that is not an Error', async () => {
    const order = await insertOrder(db);
    const { deps } = recorder({ fail: () => 'nope' });
    await expect(notifyOrderPaid(db, order.id, deps)).resolves.toBeUndefined();
    expect((await rowOf(order.id, 'customer_receipt')).error).toBe('nope');
  });

  it('keeps the provider error code in the log', async () => {
    const order = await insertOrder(db);
    const { deps } = recorder({ fail: () => new EmailSendError('Resend: Domain not verified', 'invalid_from_address', 403) });
    await notifyOrderPaid(db, order.id, deps);
    expect((await rowOf(order.id, 'customer_receipt')).error).toBe('[invalid_from_address] Resend: Domain not verified');
  });

  it('retries a failed email on the next call, and only that one', async () => {
    const order = await insertOrder(db);
    const first = recorder({ fail: failing('customer_receipt') });
    await notifyOrderPaid(db, order.id, first.deps);

    const second = recorder();
    await notifyOrderPaid(db, order.id, second.deps);
    expect(second.sent.map((m) => m.kind)).toEqual(['customer_receipt']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'sent', attempts: 2, error: null });
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('never throws even when the database does', async () => {
    const { sent, deps } = recorder();
    await expect(notifyOrderPaid(brokenDb(), 'x', deps)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('notifyOrderPaid: claims left behind by a crashed process', () => {
  const T0 = new Date('2026-11-08T16:00:00Z');
  const at = (minutes: number): NotifyDeps => ({ now: () => new Date(T0.getTime() + minutes * 60_000), appUrl: 'https://pizza.example' });

  async function crashedClaim(orderId: string) {
    await db.insert(emailLog).values({ orderId, kind: 'customer_receipt', toAddress: 'mario.rossi@example.com', status: 'sending', attempts: 1, createdAt: T0, updatedAt: T0 });
  }

  it('leaves a recent "sending" claim alone: another process is still working on it', async () => {
    const order = await insertOrder(db);
    await crashedClaim(order.id);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, { ...deps, ...at(4) });
    expect(sent.map((m) => m.kind)).toEqual(['pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'sending' });
  });

  it('takes over a claim that is older than five minutes', async () => {
    const order = await insertOrder(db);
    await crashedClaim(order.id);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, { ...deps, ...at(6) });
    expect(sent.map((m) => m.kind).sort()).toEqual(['customer_receipt', 'pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('picks up a "pending" row created by the payment step and refreshes its address', async () => {
    const order = await insertOrder(db);
    await db.insert(emailLog).values({ orderId: order.id, kind: 'customer_receipt', toAddress: 'stale@example.com', status: 'pending' });
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    expect(sent.find((m) => m.kind === 'customer_receipt')!.to).toBe('mario.rossi@example.com');
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'sent', toAddress: 'mario.rossi@example.com' });
  });
});

describe('notifyOrderPaid: who gets the alert', () => {
  it('uses the address from the settings first', async () => {
    const order = await insertOrder(db);
    setEnv({ ORDER_NOTIFICATION_EMAIL: 'env@labrace.example' });
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    expect(sent.find((m) => m.kind === 'pizzeria_alert')!.to).toBe(ALERT_TO);
  });

  it('falls back to ORDER_NOTIFICATION_EMAIL, then to the address in the business config', async () => {
    await setAlertEmail(db, null);
    const first = await insertOrder(db);
    setEnv({ ORDER_NOTIFICATION_EMAIL: 'env@labrace.example' });
    const one = recorder();
    await notifyOrderPaid(db, first.id, one.deps);
    expect(one.sent.find((m) => m.kind === 'pizzeria_alert')!.to).toBe('env@labrace.example');

    setEnv({ ORDER_NOTIFICATION_EMAIL: undefined });
    const second = await insertOrder(db);
    const two = recorder();
    await notifyOrderPaid(db, second.id, two.deps);
    expect(two.sent.find((m) => m.kind === 'pizzeria_alert')!.to).toBe('ordini@example.it');
  });

  it('skips the alert, and says so, when no address is configured anywhere; the receipt still goes out', async () => {
    await setAlertEmail(db, '   ');
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, { ...deps, alertFallbackEmail: '' });

    expect(sent.map((m) => m.kind)).toEqual(['customer_receipt']);
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'skipped', toAddress: '' });
    expect((await rowOf(order.id, 'pizzeria_alert')).error).toMatch(/recipient/i);

    await notifyOrderPaid(db, order.id, { ...deps, alertFallbackEmail: '' });
    expect(sent).toHaveLength(1);
  });

  it('accepts several addresses separated by commas, semicolons or spaces', async () => {
    await setAlertEmail(db, 'a@labrace.example, b@labrace.example; c@labrace.example');
    const order = await insertOrder(db);
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    expect(sent.find((m) => m.kind === 'pizzeria_alert')!.to).toEqual(['a@labrace.example', 'b@labrace.example', 'c@labrace.example']);
    expect((await rowOf(order.id, 'pizzeria_alert')).toAddress).toBe('a@labrace.example, b@labrace.example, c@labrace.example');
  });

  it('skips the receipt when the customer address is unusable, without blocking the alert', async () => {
    const order = await insertOrder(db, { customerEmail: 'not an address' });
    const { sent, deps } = recorder();
    await notifyOrderPaid(db, order.id, deps);
    expect(sent.map((m) => m.kind)).toEqual(['pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'skipped' });
    expect(sent[0]!.replyTo).toBeUndefined();
  });
});

describe('parseRecipients', () => {
  it('splits, trims, drops what is not an address and removes duplicates', () => {
    expect(parseRecipients(' a@x.it ,b@x.it;a@x.it  not-an-email ')).toEqual(['a@x.it', 'b@x.it']);
  });

  it('is empty for nothing', () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
    expect(parseRecipients('  ')).toEqual([]);
  });
});

describe('notifyOrderPaid with the real sender and the development mailbox', () => {
  it('leaves the two emails as files in the mailbox folder', async () => {
    const mailbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-notify-'));
    try {
      const order = await insertOrder(db);
      await notifyOrderPaid(db, order.id, {
        now: () => NOW,
        appUrl: 'https://pizza.example',
        send: (message) => sendEmail(message, { mailboxDir: mailbox, now: () => NOW }),
      });
      const files = fs.readdirSync(mailbox).sort();
      expect(files).toHaveLength(4);
      expect(files.filter((f) => f.endsWith('.html')).some((f) => f.includes('customer_receipt'))).toBe(true);
      expect(files.filter((f) => f.endsWith('.html')).some((f) => f.includes('pizzeria_alert'))).toBe(true);
      expect((await rowOf(order.id, 'customer_receipt')).provider).toBe('dev');
    } finally {
      fs.rmSync(mailbox, { recursive: true, force: true });
    }
  });
});

describe('retryFailedEmails', () => {
  const T0 = new Date('2026-11-08T16:00:00Z');
  const at = (minutes: number): NotifyDeps => ({ now: () => new Date(T0.getTime() + minutes * 60_000), appUrl: 'https://pizza.example' });

  // retryFailedEmails looks at every row, so these tests start from an empty log
  beforeEach(async () => {
    await db.delete(emailLog);
  });

  it('re-sends failed rows and reports how many went out', async () => {
    const a = await insertOrder(db);
    const b = await insertOrder(db);
    const broken = recorder({ fail: () => new Error('Resend: down') });
    await notifyOrderPaid(db, a.id, broken.deps);
    await notifyOrderPaid(db, b.id, broken.deps);

    const healthy = recorder();
    const count = await retryFailedEmails(db, healthy.deps);
    expect(count).toBe(4);
    expect(healthy.sent.filter((m) => m.idempotencyKey?.startsWith(a.id))).toHaveLength(2);
    expect(healthy.sent.filter((m) => m.idempotencyKey?.startsWith(b.id))).toHaveLength(2);
    expect((await rowsOf(a.id)).every((r) => r.status === 'sent' && r.attempts === 2)).toBe(true);
  });

  it('retries "pending" rows and rows stuck in "sending" for more than five minutes, but not fresh ones', async () => {
    const pending = await insertOrder(db);
    const stuck = await insertOrder(db);
    const fresh = await insertOrder(db);
    await db.insert(emailLog).values([
      { orderId: pending.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'pending', createdAt: T0, updatedAt: T0 },
      { orderId: stuck.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'sending', attempts: 1, createdAt: T0, updatedAt: T0 },
      { orderId: fresh.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'sending', attempts: 1, createdAt: T0, updatedAt: new Date(T0.getTime() + 8 * 60_000) },
    ]);
    // the alerts of these orders were already delivered, so only the receipts are candidates
    await db.insert(emailLog).values(
      [pending, stuck, fresh].map((o) => ({ orderId: o.id, kind: 'pizzeria_alert', toAddress: ALERT_TO, status: 'sent', attempts: 1 })),
    );

    const { sent, deps } = recorder();
    const count = await retryFailedEmails(db, { ...deps, ...at(10) });
    const resent = sent.map((m) => m.idempotencyKey);
    expect(resent).toContain(`${pending.id}:customer_receipt`);
    expect(resent).toContain(`${stuck.id}:customer_receipt`);
    expect(resent).not.toContain(`${fresh.id}:customer_receipt`);
    expect(count).toBe(2);
  });

  it('leaves sent and skipped rows alone', async () => {
    await setAlertEmail(db, null);
    const order = await insertOrder(db);
    const first = recorder();
    await notifyOrderPaid(db, order.id, { ...first.deps, alertFallbackEmail: '' });
    const again = recorder();
    const count = await retryFailedEmails(db, again.deps);
    expect(again.sent.filter((m) => m.idempotencyKey?.startsWith(order.id))).toHaveLength(0);
    expect(count).toBe(0);
    expect((await rowOf(order.id, 'pizzeria_alert')).status).toBe('skipped');
  });

  it(`gives up on a row after ${MAX_ATTEMPTS} attempts`, async () => {
    const order = await insertOrder(db);
    await db.insert(emailLog).values({ orderId: order.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'failed', attempts: MAX_ATTEMPTS, error: 'x' });
    await db.insert(emailLog).values({ orderId: order.id, kind: 'pizzeria_alert', toAddress: ALERT_TO, status: 'failed', attempts: MAX_ATTEMPTS - 1, error: 'x' });

    const { sent, deps } = recorder();
    await retryFailedEmails(db, deps);
    const mine = sent.filter((m) => m.idempotencyKey?.startsWith(order.id));
    expect(mine.map((m) => m.kind)).toEqual(['pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(await rowOf(order.id, 'pizzeria_alert')).toMatchObject({ status: 'sent', attempts: MAX_ATTEMPTS });
  });

  it('counts only what was really sent and keeps going when one keeps failing', async () => {
    const order = await insertOrder(db);
    await db.insert(emailLog).values([
      { orderId: order.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'failed', attempts: 1, error: 'x' },
      { orderId: order.id, kind: 'pizzeria_alert', toAddress: ALERT_TO, status: 'failed', attempts: 1, error: 'x' },
    ]);
    const { sent, deps } = recorder({ fail: failing('customer_receipt') });
    await retryFailedEmails(db, deps);
    expect(sent.filter((m) => m.idempotencyKey?.startsWith(order.id)).map((m) => m.kind)).toEqual(['pizzeria_alert']);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('marks the row skipped when the order is no longer paid, so it is not retried for ever', async () => {
    const order = await insertOrder(db);
    await db.insert(emailLog).values({ orderId: order.id, kind: 'customer_receipt', toAddress: 'x@example.com', status: 'failed', attempts: 1, error: 'x' });
    await db.update(orders).set({ paymentStatus: 'refunded' }).where(eq(orders.id, order.id));

    const { sent, deps } = recorder();
    await retryFailedEmails(db, deps);
    expect(sent.filter((m) => m.idempotencyKey?.startsWith(order.id))).toHaveLength(0);
    expect(await rowOf(order.id, 'customer_receipt')).toMatchObject({ status: 'skipped' });
  });

  it('returns 0 when there is nothing to do', async () => {
    const { sent, deps } = recorder();
    expect(await retryFailedEmails(db, deps)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('lets a database failure through, so the cron job reports it', async () => {
    await expect(retryFailedEmails(brokenDb(), recorder().deps)).rejects.toThrow('db down');
  });
});

describe('email_log invariants', () => {
  it('never holds two rows for the same order and kind', async () => {
    const order = await insertOrder(db);
    const { deps } = recorder();
    await Promise.all([notifyOrderPaid(db, order.id, deps), notifyOrderPaid(db, order.id, deps)]);
    const rows = await db.select().from(emailLog).where(and(eq(emailLog.orderId, order.id), eq(emailLog.kind, 'customer_receipt')));
    expect(rows).toHaveLength(1);
  });
});
