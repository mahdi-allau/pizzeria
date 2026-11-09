import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { clientIp, pruneRateLimits, rateLimit, resetRateLimit } from '@/server/rate-limit';
import { createTestDb } from '../helpers/db';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

const t0 = new Date('2026-11-10T12:00:00Z');
const plus = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe('rateLimit (fixed window in Postgres)', () => {
  it('allows up to the limit then blocks, reporting remaining and retry-after', async () => {
    const opts = { key: 'basic', limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(handle.db, { ...opts, now: plus(i) }));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]!.retryAfterSeconds).toBe(57); // window opened at t0, now = t0+3s
    expect(results[0]!.limit).toBe(3);
  });

  it('starts a fresh window once the previous one has elapsed', async () => {
    const opts = { key: 'rollover', limit: 1, windowSeconds: 10 };
    expect((await rateLimit(handle.db, { ...opts, now: plus(0) })).allowed).toBe(true);
    expect((await rateLimit(handle.db, { ...opts, now: plus(5) })).allowed).toBe(false);
    expect((await rateLimit(handle.db, { ...opts, now: plus(10) })).allowed).toBe(true);
    expect((await rateLimit(handle.db, { ...opts, now: plus(11) })).allowed).toBe(false);
  });

  it('keeps separate counters per key', async () => {
    const opts = { limit: 1, windowSeconds: 60, now: t0 };
    expect((await rateLimit(handle.db, { ...opts, key: 'a' })).allowed).toBe(true);
    expect((await rateLimit(handle.db, { ...opts, key: 'b' })).allowed).toBe(true);
    expect((await rateLimit(handle.db, { ...opts, key: 'a' })).allowed).toBe(false);
  });

  it('is atomic under concurrent requests: exactly `limit` are allowed', async () => {
    const calls = Array.from({ length: 25 }, () => rateLimit(handle.db, { key: 'burst', limit: 5, windowSeconds: 60, now: t0 }));
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(20);
  });

  it('can be reset (e.g. after a successful admin login)', async () => {
    const opts = { key: 'login:1.2.3.4', limit: 1, windowSeconds: 60, now: t0 };
    await rateLimit(handle.db, opts);
    expect((await rateLimit(handle.db, opts)).allowed).toBe(false);
    await resetRateLimit(handle.db, opts.key);
    expect((await rateLimit(handle.db, opts)).allowed).toBe(true);
  });

  it('prunes counters whose window ended long ago', async () => {
    await rateLimit(handle.db, { key: 'old', limit: 1, windowSeconds: 1, now: new Date('2020-01-01T00:00:00Z') });
    const removed = await pruneRateLimits(handle.db, new Date('2025-01-01T00:00:00Z'));
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});

describe('clientIp', () => {
  it('prefers the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('trims and ignores empty values', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBe('unknown');
  });
});
