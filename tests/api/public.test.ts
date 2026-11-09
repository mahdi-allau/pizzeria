import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orders, settings } from '@/db/schema';
import { createPendingOrder, markOrderPaid } from '@/server/orders';
import { handleOrderStatus, handleSlots } from '@/server/orders/public-http';
import { createTestDb } from '../helpers/db';
import { SLOT, T0, checkoutInput, margherita, MARGHERITA_MEDIA, setCapacity } from '../server/orders/_fixtures';
import { getRequest, readJson, uniqueIp } from './_http';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});

describe('GET /api/slots', () => {
  it('returns days and slots with remaining capacity from real settings and load', async () => {
    await setCapacity(handle.db, 8);
    await createPendingOrder(handle.db, checkoutInput({ cart: [margherita(3)], expectedTotalCents: 3 * MARGHERITA_MEDIA }), { now: T0, provider: 'mock' });

    const res = await handleSlots(getRequest('/api/slots?pizzas=6'), { db: handle.db, now: T0 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await readJson(res);
    expect(body.now).toBe(T0.toISOString());
    expect(body.timezone).toBe('Europe/Rome');
    expect(body.shop).toEqual({ open: true, closedMessage: null });
    expect(body.days).toHaveLength(3); // today + maxDaysAhead (2)
    const today = body.days[0];
    expect(today).toMatchObject({ date: '2026-11-10', weekday: 'tue', closed: false });
    const first = today.slots[0];
    expect(first).toEqual({ startIso: SLOT, time: '18:00', available: false, reason: 'full', remaining: 5 });
    expect(today.slots[1]).toMatchObject({ time: '18:15', available: true, remaining: 8 });
  });

  it('defaults to 0 pizzas and reports a temporary closure', async () => {
    await handle.db.update(settings).set({ shopOpen: false, closedMessage: 'Chiusi oggi' }).where(eq(settings.id, 1));
    try {
      const body = await readJson(await handleSlots(getRequest('/api/slots'), { db: handle.db, now: T0 }));
      expect(body.shop).toEqual({ open: false, closedMessage: 'Chiusi oggi' });
      expect(body.days.every((d: { closed: boolean }) => d.closed)).toBe(true);
    } finally {
      await handle.db.update(settings).set({ shopOpen: true, closedMessage: null }).where(eq(settings.id, 1));
    }
  });

  it.each(['-1', '51', '2.5', 'abc'])('400 for pizzas=%s', async (value) => {
    const res = await handleSlots(getRequest(`/api/slots?pizzas=${value}`), { db: handle.db, now: T0 });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('INVALID_INPUT');
  });

  it('429 after 60 requests a minute', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 60; i++) await handleSlots(getRequest('/api/slots?pizzas=x', { ip }), { db: handle.db, now: T0 });
    const res = await handleSlots(getRequest('/api/slots', { ip }), { db: handle.db, now: T0 });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('GET /api/orders/[token]', () => {
  it('returns the public status without contact details', async () => {
    const { order } = await createPendingOrder(handle.db, checkoutInput({ pickupAt: '2026-11-10T17:30:00Z' }), { now: T0, provider: 'mock' });
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });

    const res = await handleOrderStatus(getRequest(`/api/orders/${order.publicToken}`), order.publicToken, { db: handle.db, now: T0 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await readJson(res);
    expect(body).toMatchObject({ number: order.number, status: 'new', paymentStatus: 'paid', customerFirstName: 'Mario', pickupAt: '2026-11-10T17:30:00.000Z' });
    expect(Object.keys(body).sort()).toEqual(
      ['number', 'status', 'paymentStatus', 'pickupAt', 'totalCents', 'createdAt', 'paidAt', 'preparingAt', 'readyAt', 'completedAt', 'customerFirstName', 'items'].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/@|\+39/);
  });

  it('answers 404 identically for malformed and unknown tokens (no oracle)', async () => {
    const malformed = await handleOrderStatus(getRequest('/api/orders/x'), "'; drop table orders; --", { db: handle.db, now: T0 });
    const unknown = await handleOrderStatus(getRequest('/api/orders/y'), 'A'.repeat(24), { db: handle.db, now: T0 });
    expect(malformed.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await readJson(malformed)).toEqual(await readJson(unknown));
    expect(await handle.db.select().from(orders)).not.toHaveLength(0); // still there
  });

  it('429 after 120 lookups a minute', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 120; i++) await handleOrderStatus(getRequest('/api/orders/x', { ip }), 'x', { db: handle.db, now: T0 });
    expect((await handleOrderStatus(getRequest('/api/orders/x', { ip }), 'x', { db: handle.db, now: T0 })).status).toBe(429);
  });
});
