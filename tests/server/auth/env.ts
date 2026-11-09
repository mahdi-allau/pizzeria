import { afterEach, beforeEach, vi } from 'vitest';
import { resetEnvCache } from '@/env';

/**
 * Test helpers for the environment the admin and email modules read.
 * `getEnv()` caches its parse, so every change goes through `resetEnvCache()`.
 */

const MANAGED = [
  'VERCEL_ENV',
  'DEV_FEATURES',
  'APP_URL',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'ORDER_NOTIFICATION_EMAIL',
] as const;

type ManagedKey = (typeof MANAGED)[number] | 'NODE_ENV';

/** Registers hooks so each test starts as `vitest` runs: NODE_ENV=test and none of our variables set. */
export function useCleanEnv(): void {
  beforeEach(() => {
    vi.unstubAllEnvs();
    for (const key of MANAGED) vi.stubEnv(key, undefined);
    vi.stubEnv('NODE_ENV', 'test');
    resetEnvCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });
}

export function setEnv(values: Partial<Record<ManagedKey, string | undefined>>): void {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  resetEnvCache();
}
