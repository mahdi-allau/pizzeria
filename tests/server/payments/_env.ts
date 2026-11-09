import { afterAll, beforeEach } from 'vitest';
import { resetEnvCache } from '@/env';

const KEYS = [
  'PAYMENTS_PROVIDER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_ALLOW_LIVE',
  'MOCK_WEBHOOK_SECRET',
  'DEV_FEATURES',
  'VERCEL_ENV',
  'CRON_SECRET',
] as const;
export type EnvKey = (typeof KEYS)[number];

/**
 * Lets a test file set payment-related env vars. Every test starts from a clean slate (no Stripe keys, dev features
 * at their default: on under vitest); the original values are restored when the file is done.
 */
export function scopedEnv() {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const clear = () => {
    for (const k of KEYS) delete process.env[k];
    resetEnvCache();
  };
  beforeEach(clear);
  afterAll(() => {
    clear();
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    resetEnvCache();
  });
  return (vars: Partial<Record<EnvKey, string>>) => {
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
    resetEnvCache();
  };
}
