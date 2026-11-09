import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orders } from '@/db/schema';
import {
  changeOrderStatus,
  countByStatus,
  createPendingOrder,
  getOrderByToken,
  getOrderDetails,
  listBoardOrders,
  listOrders,
  markOrderPaid,
} from '@/server/orders';
import { createTestDb } from '../../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, SLOT_2, T0, checkoutInput, cola, margherita, plusMinutes } from './_fixtures';

let handle: DbHandle;
const ids: Record<string, { id: string; number: number; publicToken: string }> = {};

/**
 * Fixture set (all created at T0):
 *  pending  – awaiting payment, SLOT
 *  fresh    – paid (new), SLOT_2, Giulia Bianchi
 *  cooking  – preparing, SLOT
 *  done     – completed 1 h after T0
 *  old      – completed 5 h after... (completedAt pushed 5 h into the past relative to the board's "now")
 *  gone     – cancelled
 */
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
  const make = async (name: string, over: Parameters<typeof checkoutInput>[0] = {}) => {
    const { order } = await createPendingOrder(handle.db, checkoutInput(over), { now: T0, provider: 'mock' });
    ids[name] = order;
    return order;
  };
  const paid = async (name: string, over: Parameters<typeof checkoutInput>[0] = {}) => {
    const order = await make(name, over);
    await markOrderPaid(handle.db, { orderId: order.id, now: T0 });
    return order;
  };

  await make('pending');
  await paid('fresh', {
    pickupAt: SLOT_2,
    customer: { name: 'Giulia Bianchi', phone: '+393471112233', email: 'giulia@example.it' },
    cart: [cola(1)],
    expectedTotalCents: COCA_COLA,
    notes: 'Citofonare',
  });
  const cooking = await paid('cooking');
  await changeOrderStatus(handle.db, cooking.id, 'preparing', 'admin', { now: T0 });
  for (const name of ['done', 'old']) {
    const o = await paid(name, { cart: [margherita(1)], expectedTotalCents: MARGHERITA_MEDIA });
    await changeOrderStatus(handle.db, o.id, 'preparing', 'admin', { now: T0 });
    await changeOrderStatus(handle.db, o.id, 'ready', 'admin', { now: T0 });
    await changeOrderStatus(handle.db, o.id, 'completed', 'admin', { now: plusMinutes(T0, 60) });
  }
  await handle.db.update(orders).set({ completedAt: plusMinutes(T0, -300) }).where(eq(orders.id, ids.old!.id));
  const gone = await paid('gone', { cart: [margherita(1)], expectedTotalCents: MARGHERITA_MEDIA });
  await changeOrderStatus(handle.db, gone.id, 'cancelled', 'admin', { now: T0, reason: 'test' });
});
afterAll(async () => {
  await handle.close();
});

describe('getOrderByToken', () => {
  it('returns the public view without contact details', async () => {
    const view = await getOrderByToken(handle.db, ids.cooking!.publicToken);
    expect(view).toEqual({
      number: ids.cooking!.number,
      status: 'preparing',
      paymentStatus: 'paid',
      pickupAt: '2026-11-10T17:00:00.000Z',
      totalCents: MARGHERITA_MEDIA * 2 + COCA_COLA,
      createdAt: T0.toISOString(),
      paidAt: T0.toISOString(),
      preparingAt: T0.toISOString(),
      readyAt: null,
      completedAt: null,
      customerFirstName: 'Mario',
      items: [
        { name: 'Margherita', quantity: 2, lineTotalCents: MARGHERITA_MEDIA * 2 },
        { name: 'Coca-Cola', quantity: 1, lineTotalCents: COCA_COLA },
      ],
    });
    expect(JSON.stringify(view)).not.toMatch(/example\.it|\+39/);
  });

  it('returns null for an unknown token', async () => {
    expect(await getOrderByToken(handle.db, 'x'.repeat(24))).toBeNull();
  });
});

describe('getOrderDetails', () => {
  it('returns order, items with their frozen config, and the event trail', async () => {
    const details = await getOrderDetails(handle.db, ids.gone!.id);
    expect(details).toMatchObject({
      id: ids.gone!.id,
      number: ids.gone!.number,
      status: 'cancelled',
      paymentStatus: 'paid',
      customerEmail: 'mario.rossi@example.it',
      customerPhone: '+393331234567',
      publicToken: ids.gone!.publicToken,
      paymentProvider: 'mock',
      itemsSummary: ['1× Margherita (Media)'],
    });
    expect(details!.cancelledAt).toBe(T0.toISOString());
    expect(details!.items[0]).toMatchObject({ kind: 'pizza', name: 'Margherita', layoutSeed: 'margherita', config: { type: 'pizza', size: { slug: 'media' } } });
    expect(details!.events.map((e) => e.type)).toEqual(['created', 'paid', 'status_changed']);
    expect(details!.events[2]).toMatchObject({ actor: 'admin', fromStatus: 'new', toStatus: 'cancelled', data: { reason: 'test', needsRefund: true } });
    expect(JSON.parse(JSON.stringify(details))).toEqual(details); // JSON-friendly
  });

  it('returns null for an unknown or malformed id', async () => {
    expect(await getOrderDetails(handle.db, randomUUID())).toBeNull();
    expect(await getOrderDetails(handle.db, 'not-a-uuid')).toBeNull();
  });
});

describe('listBoardOrders', () => {
  it('shows active orders plus orders completed in the last 4 hours, by pickup time', async () => {
    const board = await listBoardOrders(handle.db, { now: plusMinutes(T0, 90) });
    const names = board.map((o) => Object.entries(ids).find(([, v]) => v.id === o.id)![0]);
    expect(names.sort()).toEqual(['cooking', 'done', 'fresh'].sort());
    expect(board.at(-1)!.id).toBe(ids.fresh!.id); // SLOT_2 is the latest pickup
    expect(board.find((o) => o.id === ids.cooking!.id)!.items).toHaveLength(2);
  });
});

describe('listOrders', () => {
  it('lists everything newest pickup first with a total', async () => {
    const { orders: rows, total } = await listOrders(handle.db, {});
    expect(total).toBe(6);
    expect(rows[0]!.id).toBe(ids.fresh!.id);
  });

  it('filters by status, pickup window and paginates', async () => {
    expect((await listOrders(handle.db, { statuses: ['completed'] })).total).toBe(2);
    expect((await listOrders(handle.db, { pickupFrom: new Date(SLOT_2) })).orders.map((o) => o.id)).toEqual([ids.fresh!.id]);
    expect((await listOrders(handle.db, { pickupTo: new Date(SLOT_2) })).total).toBe(5);
    const page = await listOrders(handle.db, { limit: 2, offset: 2 });
    expect(page.orders).toHaveLength(2);
    expect(page.total).toBe(6);
  });

  it('searches by number, name, phone and email', async () => {
    const one = async (search: string) => (await listOrders(handle.db, { search })).orders.map((o) => o.id);
    expect(await one(String(ids.fresh!.number))).toEqual([ids.fresh!.id]);
    expect(await one('bianchi')).toEqual([ids.fresh!.id]);
    expect(await one('347111')).toEqual([ids.fresh!.id]);
    expect(await one('GIULIA@')).toEqual([ids.fresh!.id]);
    expect(await one('%')).toEqual([]); // LIKE wildcards are escaped
  });
});

describe('countByStatus', () => {
  it('counts every status (zero included)', async () => {
    expect(await countByStatus(handle.db)).toEqual({
      awaiting_payment: 1,
      new: 1,
      preparing: 1,
      ready: 0,
      completed: 2,
      cancelled: 1,
      expired: 0,
    });
  });
});
