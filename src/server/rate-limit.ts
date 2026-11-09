import { eq, lt, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { rateLimits } from '@/db/schema';

/**
 * Fixed-window rate limiter stored in Postgres, so it holds across serverless instances without Redis.
 * One atomic `INSERT ... ON CONFLICT DO UPDATE` per call; concurrent requests cannot slip past the limit.
 */

export interface RateLimitOptions {
  /** e.g. `checkout:203.0.113.7` or `admin-login:203.0.113.7`. Keep secrets out of keys. */
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (0 when the request was allowed). Send as the Retry-After header. */
  retryAfterSeconds: number;
}

export async function rateLimit(db: Db, { key, limit, windowSeconds, now = new Date() }: RateLimitOptions): Promise<RateLimitResult> {
  const nowIso = now.toISOString();
  const windowEnded = sql`${rateLimits.windowStart} + (${windowSeconds}::int * interval '1 second') <= ${nowIso}::timestamptz`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${windowEnded} THEN ${nowIso}::timestamptz ELSE ${rateLimits.windowStart} END`,
        count: sql`CASE WHEN ${windowEnded} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const { count, windowStart } = row!;
  const allowed = count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now.getTime()) / 1000)),
  };
}

/** Clears a counter, e.g. after a successful admin login. */
export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Housekeeping: drop counters whose window started before `olderThan`. Returns how many were removed. */
export async function pruneRateLimits(db: Db, olderThan: Date): Promise<number> {
  const deleted = await db.delete(rateLimits).where(lt(rateLimits.windowStart, olderThan)).returning({ key: rateLimits.key });
  return deleted.length;
}

/** Best-effort client address behind Vercel / a reverse proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}
