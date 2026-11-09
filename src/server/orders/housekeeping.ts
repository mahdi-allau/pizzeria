import { createHash, timingSafeEqual } from 'node:crypto';
import type { Db } from '@/db/client';
import { getEnv } from '@/env';
import * as emailNotify from '@/server/email/notify';
import type { PaymentProvider } from '@/server/payments/types';
import { pruneRateLimits } from '@/server/rate-limit';
import { pruneEvents } from '@/server/realtime';
import { errorJson, json } from './http';
import { expireStaleOrders } from './lifecycle';

export interface HousekeepingDeps {
  db: Db;
  now?: Date;
  /** Default getPaymentProvider; a failure only disables PaymentIntent cancellation. */
  getProvider?: () => PaymentProvider;
  /** Default `retryFailedEmails` from @/server/email/notify (when the email module provides it). */
  retryEmails?: (db: Db) => Promise<unknown>;
}

const DAY_MS = 24 * 3_600_000;

/** Constant-time comparison of the bearer token with CRON_SECRET (hashing equalises the lengths). */
export function cronAuthorized(request: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/**
 * The email module owns `retryFailedEmails(db)`. Resolved through the module namespace so this file keeps compiling
 * while that module is being written; once it exists it is called automatically.
 */
function defaultRetryEmails(): ((db: Db) => Promise<unknown>) | undefined {
  const fn = (emailNotify as { retryFailedEmails?: (db: Db) => Promise<unknown> }).retryFailedEmails;
  return typeof fn === 'function' ? fn : undefined;
}

/**
 * GET /api/cron/housekeeping (Vercel Cron, `Authorization: Bearer <CRON_SECRET>`).
 * Expires lapsed unpaid orders, prunes realtime events (> 2 days) and rate-limit counters (> 1 day), retries
 * failed emails. Each step runs even if another fails.
 * 200 { ok: true, expiredOrders, prunedEvents, prunedRateLimits, emails } · 500 { ok: false, …, failed: [step] } · 401
 */
export async function handleHousekeeping(request: Request, deps: HousekeepingDeps): Promise<Response> {
  if (!cronAuthorized(request)) return errorJson(401, 'UNAUTHORIZED', 'Non autorizzato.');
  const now = deps.now ?? new Date();
  const failed: string[] = [];

  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      console.error(`[housekeeping] ${name} failed`, error);
      failed.push(name);
      return null;
    }
  };

  let provider: PaymentProvider | null = null;
  try {
    provider = deps.getProvider ? deps.getProvider() : null;
  } catch {
    provider = null; // payments not configured: still expire orders, just don't cancel intents
  }

  const expired = await step('expireOrders', () => expireStaleOrders(deps.db, { now, provider }));
  const prunedEvents = await step('pruneEvents', () => pruneEvents(deps.db, new Date(now.getTime() - 2 * DAY_MS)));
  const prunedRateLimits = await step('pruneRateLimits', () => pruneRateLimits(deps.db, new Date(now.getTime() - DAY_MS)));
  const retry = deps.retryEmails ?? defaultRetryEmails();
  const emails = retry ? await step('emails', () => retry(deps.db)) : null;

  const body = {
    ok: failed.length === 0,
    expiredOrders: expired?.expired ?? null,
    prunedEvents,
    prunedRateLimits,
    emails: emails ?? null,
    ...(failed.length ? { failed } : {}),
  };
  return json(body, failed.length ? 500 : 200);
}
