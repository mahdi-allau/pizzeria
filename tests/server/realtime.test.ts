import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { latestEventId, pruneEvents, publishEvent, readEventsSince } from '@/server/realtime';
import { createTestDb } from '../helpers/db';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

describe('realtime event feed', () => {
  it('starts empty', async () => {
    expect(await latestEventId(handle.db)).toBe(0);
    expect(await readEventsSince(handle.db, 0)).toEqual([]);
  });

  it('publishes events with increasing ids and returns the new id', async () => {
    const a = await publishEvent(handle.db, 'order.paid', null, { number: 1001 });
    const b = await publishEvent(handle.db, 'order.status', null, { to: 'preparing' });
    expect(b).toBeGreaterThan(a);
    expect(await latestEventId(handle.db)).toBe(b);
  });

  it('reads only the events after a cursor, oldest first (Last-Event-ID resume)', async () => {
    const all = await readEventsSince(handle.db, 0);
    expect(all.map((e) => e.kind)).toEqual(['order.paid', 'order.status']);
    expect(all[0]).toMatchObject({ orderId: null, data: { number: 1001 } });

    const after = await readEventsSince(handle.db, all[0]!.id);
    expect(after.map((e) => e.kind)).toEqual(['order.status']);
    expect(await readEventsSince(handle.db, all[1]!.id)).toEqual([]);
  });

  it('honours the limit', async () => {
    expect(await readEventsSince(handle.db, 0, 1)).toHaveLength(1);
  });

  it('publishes atomically with the surrounding transaction', async () => {
    const before = await latestEventId(handle.db);
    await expect(
      handle.db.transaction(async (tx) => {
        await publishEvent(tx, 'order.created', null);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await latestEventId(handle.db)).toBe(before);
  });

  it('prunes old events but keeps recent ones', async () => {
    await new Promise((r) => setTimeout(r, 15));
    const cutoff = new Date();
    await new Promise((r) => setTimeout(r, 15));
    await publishEvent(handle.db, 'order.created', null);
    const removed = await pruneEvents(handle.db, cutoff);
    expect(removed).toBeGreaterThanOrEqual(2);
    const left = await readEventsSince(handle.db, 0);
    expect(left).toHaveLength(1);
    expect(left[0]!.kind).toBe('order.created');
  });
});
