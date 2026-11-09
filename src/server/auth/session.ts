import { SignJWT, jwtVerify } from 'jose';
import { devFeaturesEnabled, getEnv } from '@/env';
import { AdminNotConfiguredError } from './errors';

/**
 * Admin session: a signed JWT (HS256) in an HttpOnly cookie. Stateless, so it works on any serverless instance.
 *
 * This file is shared by the Proxy (an optimistic gate on every /admin request) and by Node code (login, route
 * handlers, server components): it depends on `jose` and the validated env only, never on `next/headers`.
 * Reading the cookie out of a request is done by the caller (`request.cookies`, `cookies()` or `getCookieValue`).
 *
 * Limits worth knowing: there is no server-side revocation. Logging out clears the cookie; a copied cookie stays valid
 * until it expires (12 h). Rotating ADMIN_SESSION_SECRET invalidates every session at once.
 */

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Used only when development helpers are on and ADMIN_SESSION_SECRET is missing or too short. Never in production. */
export const DEV_SESSION_SECRET = 'pizzeria-dev-only-session-secret-do-not-use-in-production';

const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 2048;
const CLOCK_SKEW_SECONDS = 60;
const encoder = new TextEncoder();

let warnedShortSecret = false;
/** Test hook: forget which warnings were already printed. */
export function resetAdminSessionWarnings(): void {
  warnedShortSecret = false;
}

/** The signing key, or null when admin sessions are disabled (production without a proper ADMIN_SESSION_SECRET). */
export function adminSessionSecret(): Uint8Array | null {
  const configured = getEnv().ADMIN_SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return encoder.encode(configured);
  if (devFeaturesEnabled()) {
    if (configured && !warnedShortSecret) {
      warnedShortSecret = true;
      console.warn(`[admin] ADMIN_SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters: using the development secret instead.`);
    }
    return encoder.encode(DEV_SESSION_SECRET);
  }
  return null;
}

export function isSessionConfigured(): boolean {
  return adminSessionSecret() !== null;
}

export async function createSessionToken(options: { now?: Date } = {}): Promise<string> {
  const secret = adminSessionSecret();
  if (!secret) throw new AdminNotConfiguredError('ADMIN_SESSION_SECRET is missing or shorter than 32 characters');
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

/** True for a token we issued that has not expired. Never throws: anything unexpected is simply "not a session". */
export async function verifySessionToken(token: string | null | undefined, options: { now?: Date } = {}): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const secret = adminSessionSecret();
  if (!secret) return false;
  const now = options.now ?? new Date();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      subject: 'admin',
      currentDate: now,
      requiredClaims: ['sub', 'exp', 'iat', 'jti'],
    });
    const { iat, exp, jti } = payload;
    if (typeof iat !== 'number' || typeof exp !== 'number' || typeof jti !== 'string' || jti.length === 0) return false;
    if (exp - iat > SESSION_TTL_SECONDS) return false;
    if (iat > Math.floor(now.getTime() / 1000) + CLOCK_SKEW_SECONDS) return false;
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────────── the cookie ─────────────────────────────

const isProduction = (): boolean => getEnv().NODE_ENV === 'production';

/** `__Host-` in production: the browser then guarantees Secure, Path=/ and no Domain. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-pz_admin' : 'pz_admin';
}

function attributes(maxAge: number): string {
  const parts = [`Max-Age=${maxAge}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isProduction()) parts.push('Secure'); // plain http://localhost in development has to keep working
  return parts.join('; ');
}

/** The `Set-Cookie` header value that starts a session. */
export function serializeSessionCookie(token: string): string {
  return `${sessionCookieName()}=${token}; ${attributes(SESSION_TTL_SECONDS)}`;
}

/** The `Set-Cookie` header value that ends it. */
export function serializeClearedSessionCookie(): string {
  return `${sessionCookieName()}=; ${attributes(0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Reads one cookie out of a `Cookie` header. The first occurrence wins; the name must match exactly. */
export function getCookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return undefined;
}
