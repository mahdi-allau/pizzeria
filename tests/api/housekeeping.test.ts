import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orders, rateLimits, realtimeEvents } from '@/db/schema';
import { createPendingOrder } from '@/server/orders';
import { handleHousekeeping } from '@/server/orders/housekeeping';
import { publishEvent } from '@/server/realtime';
import { createTestDb } from '../helpers/db';
import { T0, checkoutInput, plusMinutes, recordingProvider } from '../server/orders/_fixtures';
import { scopedEnv } from '../server/payments/_env';
import { getRequest, readJson } from './_http';

const setEnv = scopedEnv();
let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});

const cron = (auth?: string) => getRequest('/api/cron/housekeeping', { headers: auth ? { authorization: auth } : {} });

describe('GET /api/cron/housekeeping', () => {
  it('401 without CRON_SECRET configured, or with a wrong / missing bearer token', async () => {
    const deps = { db: handle.db, now: T0 };
    expect((await handleHousekeeping(cron('Bearer anything'), deps)).status).toBe(401);
    setEnv({ CRON_SECRET: 'cron-secret-123' });
    expect((await handleHousekeeping(cron(), deps)).status).toBe(401);
    expect((await handleHousekeeping(cron('Bearer cron-secret-12'), deps)).status).toBe(401);
    expect((await handleHousekeeping(cron('cron-secret-123'), deps)).status).toBe(401);
  });

  it('expires stale orders, prunes old events and counters, retries emails, and reports counts', async () => {
    setEnv({ CRON_SECRET: 'cron-secret-123' });
    const { order } = await createPendingOrder(handle.db, checkoutInput(), { now: T0, provider: 'stripe', holdMinutes: 5 });
    await handle.db.update(orders).set({ paymentIntentId: 'pi_stale' }).where(eq(orders.id, order.id));
    await publishEvent(handle.db, 'order.paid', null);
    await handle.db.update(realtimeEvents).set({ createdAt: plusMinutes(T0, -3 * 24 * 60) });
    await handle.db.insert(rateLimits).values({ key: 'old', windowStart: plusMinutes(T0, -2 * 24 * 60), count: 1 });

    const { provider, calls } = recordingProvider();
    const retryEmails = vi.fn(async () => ({ retried: 0 }));
    const now = plusMinutes(T0, 30);
    const res = await handleHousekeeping(cron('Bearer cron-secret-123'), { db: handle.db, now, getProvider: () => provider, retryEmails });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await readJson(res)).toEqual({ ok: true, expiredOrders: 1, prunedEvents: 1, prunedRateLimits: 1, emails: { retried: 0 } });
    expect((await handle.db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe('expired');
    expect(calls).toEqual([{ method: 'cancelPayment', args: ['pi_stale'] }]);
    expect(retryEmails).toHaveBeenCalledWith(handle.db);
  });

  it('still runs when payments are not configured, and reports a failing step without hiding the others', async () => {
    setEnv({ CRON_SECRET: 'cron-secret-123' });
    const res = await handleHousekeeping(cron('Bearer cron-secret-123'), {
      db: handle.db,
      now: T0,
      getProvider: () => {
        throw new Error('no provider');
      },
      retryEmails: async () => {
        throw new Error('smtp down');
      },
    });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toMatchObject({ ok: false, expiredOrders: 0, prunedEvents: 0, prunedRateLimits: 0, emails: null, failed: ['emails'] });
  });
});
