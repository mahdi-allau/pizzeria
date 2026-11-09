import { createHash, timingSafeEqual } from 'node:crypto';
import { devFeaturesEnabled, getEnv } from '@/env';
import { AdminNotConfiguredError } from './errors';
import { isValidPasswordHash, verifyPassword } from './password';
import { isSessionConfigured } from './session';

export { AdminNotConfiguredError };

/**
 * Where the admin password comes from, in order of preference:
 *   1. ADMIN_PASSWORD_HASH  (scrypt hash, see `npm run admin:hash`)
 *   2. ADMIN_PASSWORD       (plain text; compared through SHA-256 digests so its length does not leak)
 *   3. development only: the fixed password "pizza", with a one-time warning
 * Anything else, or a ADMIN_PASSWORD_HASH that is not a valid hash, means admin login is DISABLED: there is never a
 * silent fallback to a weaker secret.
 */

export const DEV_ADMIN_PASSWORD = 'pizza';

export type CredentialMode = 'hash' | 'plain' | 'dev' | 'disabled';

let warnedInvalidHash = false;
let warnedDevPassword = false;

/** Test hook: forget which warnings were already printed. */
export function resetAdminCredentialWarnings(): void {
  warnedInvalidHash = false;
  warnedDevPassword = false;
}

export function credentialMode(): CredentialMode {
  const env = getEnv();
  if (env.ADMIN_PASSWORD_HASH) {
    if (isValidPasswordHash(env.ADMIN_PASSWORD_HASH)) return 'hash';
    if (!warnedInvalidHash) {
      warnedInvalidHash = true;
      console.error(
        '[admin] ADMIN_PASSWORD_HASH is set but is not a valid hash, so admin login is disabled. ' +
          'Generate one with `npm run admin:hash -- "your password"`; in .env files every "$" must be written "\\$".',
      );
    }
    return 'disabled';
  }
  if (env.ADMIN_PASSWORD) return 'plain';
  return devFeaturesEnabled() ? 'dev' : 'disabled';
}

/** Both a password check and a session secret are available: login can work. */
export function isAdminConfigured(): boolean {
  return credentialMode() !== 'disabled' && isSessionConfigured();
}

const digest = (value: string): Buffer => createHash('sha256').update(value.normalize('NFKC')).digest();
const sameSecret = (candidate: string, secret: string): boolean => timingSafeEqual(digest(candidate), digest(secret));

/** Checks a login attempt. Throws `AdminNotConfiguredError` when there is nothing to check it against. */
export async function checkAdminPassword(candidate: string): Promise<boolean> {
  const mode = credentialMode();
  const env = getEnv();
  switch (mode) {
    case 'hash':
      return verifyPassword(candidate, env.ADMIN_PASSWORD_HASH!);
    case 'plain':
      return sameSecret(candidate, env.ADMIN_PASSWORD!);
    case 'dev':
      if (!warnedDevPassword) {
        warnedDevPassword = true;
        console.warn(`[admin] ADMIN_PASSWORD is not set: the development password "${DEV_ADMIN_PASSWORD}" works. This is disabled in production.`);
      }
      return sameSecret(candidate, DEV_ADMIN_PASSWORD);
    default:
      throw new AdminNotConfiguredError('Set ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD) and ADMIN_SESSION_SECRET to enable the admin login');
  }
}
