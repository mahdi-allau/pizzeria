import { z } from 'zod';

/**
 * Validated environment. Parsed lazily (on first use) so `next build` works without secrets and each subsystem
 * only complains about the variables it actually needs.
 */

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const str = () => z.preprocess(blankToUndefined, z.string().optional());
const url = () => z.preprocess(blankToUndefined, z.url().optional());
const bool = () =>
  z.preprocess((v) => {
    const s = blankToUndefined(v);
    if (s === undefined) return undefined;
    return String(s).toLowerCase() === 'true' || s === '1';
  }, z.boolean().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),

  /** Public origin of the site, used for absolute links in emails, redirects and metadata. */
  APP_URL: url(),

  /** Postgres connection string (Neon/Supabase). Unset in dev = embedded PGlite. */
  DATABASE_URL: str(),
  PGLITE_DATA_DIR: str(),

  /** Admin: set ADMIN_PASSWORD_HASH (preferred, `npm run admin:hash`) or ADMIN_PASSWORD. */
  ADMIN_PASSWORD: str(),
  ADMIN_PASSWORD_HASH: str(),
  /** 32+ random chars used to sign admin session cookies. */
  ADMIN_SESSION_SECRET: str(),

  PAYMENTS_PROVIDER: z.preprocess(blankToUndefined, z.enum(['stripe', 'mock']).optional()),
  STRIPE_SECRET_KEY: str(),
  STRIPE_WEBHOOK_SECRET: str(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: str(),
  /** Safety valve: live keys are refused unless this is explicitly "true". The brief is TEST MODE ONLY. */
  STRIPE_ALLOW_LIVE: bool(),
  /** Secret used to sign the simulated webhook of the dev payment provider. */
  MOCK_WEBHOOK_SECRET: str(),

  RESEND_API_KEY: str(),
  /** e.g. "Pizzeria La Brace <ordini@tuodominio.it>" (the domain must be verified in Resend). */
  EMAIL_FROM: str(),
  ORDER_NOTIFICATION_EMAIL: str(),

  /** Bearer token for /api/cron/* (Vercel Cron sends it as CRON_SECRET). */
  CRON_SECRET: str(),

  /** Force dev-only helpers (mock payments, embedded DB in a prod build, dev mailbox) on or off. */
  DEV_FEATURES: bool(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Test hook: forget the parsed env so the next `getEnv()` re-reads `process.env`. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** True only on a real production deployment. */
export function isDeployedProduction(): boolean {
  const env = getEnv();
  return env.VERCEL_ENV === 'production';
}

/**
 * Dev-only helpers (simulated payments, embedded database, local mailbox).
 * Default: on outside `NODE_ENV=production`. Never on for a Vercel production deployment, whatever the flag says.
 */
export function devFeaturesEnabled(): boolean {
  const env = getEnv();
  if (env.VERCEL_ENV === 'production') return false;
  if (env.DEV_FEATURES !== undefined) return env.DEV_FEATURES;
  return env.NODE_ENV !== 'production';
}

export function appUrl(): string {
  return (getEnv().APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
