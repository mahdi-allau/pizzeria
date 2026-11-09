import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminNotConfiguredError } from '@/server/auth/errors';
import {
  DEV_SESSION_SECRET,
  SESSION_TTL_SECONDS,
  adminSessionSecret,
  createSessionToken,
  getCookieValue,
  isSessionConfigured,
  resetAdminSessionWarnings,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionCookieName,
  verifySessionToken,
} from '@/server/auth/session';
import { installCleanEnv, setEnv } from './env';

installCleanEnv();

const SECRET = 'k3y-for-tests-0123456789-abcdefghijklmnopqrstuvwxyz';
const T0 = new Date('2026-11-09T10:00:00Z');
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const later = (secondsLater: number) => new Date(T0.getTime() + secondsLater * 1000);

beforeEach(() => {
  resetAdminSessionWarnings();
  setEnv({ ADMIN_SESSION_SECRET: SECRET });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A token signed with the real secret but with claims we choose, to probe the verifier. */
async function forge(claims: Record<string, unknown>, options: { alg?: string; secret?: string; header?: Record<string, unknown> } = {}) {
  const key = new TextEncoder().encode(options.secret ?? SECRET);
  return new SignJWT(claims).setProtectedHeader({ alg: options.alg ?? 'HS256', ...options.header }).sign(key);
}
const goodClaims = () => ({ sub: 'admin', iat: seconds(T0), exp: seconds(T0) + SESSION_TTL_SECONDS, jti: 'abc' });

describe('createSessionToken', () => {
  it('signs an HS256 JWT for the admin, valid for 12 hours, with a unique id', async () => {
    const token = await createSessionToken({ now: T0 });
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'HS256' });
    const claims = decodeJwt(token);
    expect(claims.sub).toBe('admin');
    expect(claims.iat).toBe(seconds(T0));
    expect(claims.exp).toBe(seconds(T0) + 12 * 60 * 60);
    expect(typeof claims.jti).toBe('string');
    expect(claims.jti!.length).toBeGreaterThanOrEqual(16);
    expect(decodeJwt(await createSessionToken({ now: T0 })).jti).not.toBe(claims.jti);
  });

  it('carries nothing but the claims it needs', async () => {
    expect(Object.keys(decodeJwt(await createSessionToken({ now: T0 }))).sort()).toEqual(['exp', 'iat', 'jti', 'sub']);
  });

  it('lasts 12 hours', () => {
    expect(SESSION_TTL_SECONDS).toBe(43_200);
  });
});

describe('verifySessionToken', () => {
  it('accepts a fresh token, until the moment it expires', async () => {
    const token = await createSessionToken({ now: T0 });
    expect(await verifySessionToken(token, { now: T0 })).toBe(true);
    expect(await verifySessionToken(token, { now: later(SESSION_TTL_SECONDS - 1) })).toBe(true);
    expect(await verifySessionToken(token, { now: later(SESSION_TTL_SECONDS) })).toBe(false);
    expect(await verifySessionToken(token, { now: later(SESSION_TTL_SECONDS + 3600) })).toBe(false);
  });

  it('rejects a token that claims to come from the future', async () => {
    const token = await createSessionToken({ now: later(3600) });
    expect(await verifySessionToken(token, { now: T0 })).toBe(false);
  });

  it('rejects a tampered payload or signature', async () => {
    const token = await createSessionToken({ now: T0 });
    const [header, payload, signature] = token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ ...decodeJwt(token), exp: seconds(T0) + 10 * SESSION_TTL_SECONDS })).toString('base64url');
    expect(await verifySessionToken(`${header}.${forgedPayload}.${signature}`, { now: T0 })).toBe(false);
    const flipped = signature.slice(0, -2) + (signature.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySessionToken(`${header}.${payload}.${flipped}`, { now: T0 })).toBe(false);
  });

  it('rejects a token signed with another secret', async () => {
    expect(await verifySessionToken(await forge(goodClaims(), { secret: `${SECRET}-other` }), { now: T0 })).toBe(false);
  });

  it('accepts only HS256: no "none", no other algorithm', async () => {
    expect(await verifySessionToken(await forge(goodClaims()), { now: T0 })).toBe(true);
    expect(await verifySessionToken(await forge(goodClaims(), { alg: 'HS512' }), { now: T0 })).toBe(false);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(goodClaims())).toString('base64url')}.`;
    expect(await verifySessionToken(unsigned, { now: T0 })).toBe(false);
  });

  it('insists on the claims it issues', async () => {
    const { sub: _sub, ...noSubject } = goodClaims();
    const { exp: _exp, ...noExpiry } = goodClaims();
    const { iat: _iat, ...noIssuedAt } = goodClaims();
    const { jti: _jti, ...noId } = goodClaims();
    for (const claims of [{ ...goodClaims(), sub: 'someone-else' }, noSubject, noExpiry, noIssuedAt, noId, { ...goodClaims(), jti: '' }]) {
      expect(await verifySessionToken(await forge(claims), { now: T0 })).toBe(false);
    }
  });

  it('rejects a lifetime longer than the one we grant, even when correctly signed', async () => {
    const claims = { ...goodClaims(), exp: seconds(T0) + SESSION_TTL_SECONDS + 1 };
    expect(await verifySessionToken(await forge(claims), { now: T0 })).toBe(false);
  });

  it('answers false, and never throws, for anything that is not a token', async () => {
    for (const junk of [undefined, null, '', ' ', 'abc', 'a.b.c', '....', `${'x'.repeat(10_000)}.y.z`, 'Bearer abc', '{}']) {
      expect(await verifySessionToken(junk as string | null | undefined, { now: T0 }), String(junk)).toBe(false);
    }
  });
});

describe('the signing secret', () => {
  it('invalidates sessions when ADMIN_SESSION_SECRET changes (the way to log everybody out)', async () => {
    const token = await createSessionToken({ now: T0 });
    setEnv({ ADMIN_SESSION_SECRET: `${SECRET}-rotated` });
    expect(await verifySessionToken(token, { now: T0 })).toBe(false);
  });

  it('falls back to a fixed development secret when development helpers are on', async () => {
    setEnv({ ADMIN_SESSION_SECRET: undefined });
    expect(isSessionConfigured()).toBe(true);
    expect(new TextDecoder().decode(adminSessionSecret()!)).toBe(DEV_SESSION_SECRET);
    expect(DEV_SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(await verifySessionToken(await createSessionToken({ now: T0 }), { now: T0 })).toBe(true);
  });

  it('ignores a secret shorter than 32 characters (with a warning in development)', async () => {
    setEnv({ ADMIN_SESSION_SECRET: 'too-short' });
    expect(new TextDecoder().decode(adminSessionSecret()!)).toBe(DEV_SESSION_SECRET);
    expect(console.warn).toHaveBeenCalled();
  });

  it('disables admin sessions in production without a usable secret', async () => {
    for (const secret of [undefined, 'too-short', ' '.repeat(40)]) {
      setEnv({ NODE_ENV: 'production', ADMIN_SESSION_SECRET: secret });
      expect(isSessionConfigured(), String(secret)).toBe(false);
      expect(adminSessionSecret()).toBeNull();
      await expect(createSessionToken({ now: T0 })).rejects.toBeInstanceOf(AdminNotConfiguredError);
      expect(await verifySessionToken(await forge(goodClaims()), { now: T0 })).toBe(false);
    }
  });

  it('never uses the development secret on a Vercel production deployment', () => {
    setEnv({ VERCEL_ENV: 'production', DEV_FEATURES: 'true', ADMIN_SESSION_SECRET: undefined });
    expect(isSessionConfigured()).toBe(false);
  });

  it('works in production with a proper secret', async () => {
    setEnv({ NODE_ENV: 'production' });
    expect(isSessionConfigured()).toBe(true);
    expect(await verifySessionToken(await createSessionToken({ now: T0 }), { now: T0 })).toBe(true);
  });
});

describe('the session cookie', () => {
  it('is called pz_admin in development and __Host-pz_admin in production', () => {
    expect(sessionCookieName()).toBe('pz_admin');
    setEnv({ NODE_ENV: 'production' });
    expect(sessionCookieName()).toBe('__Host-pz_admin');
  });

  it('is HttpOnly, SameSite=Lax, site-wide and lives 12 hours; no Secure over plain http in development', () => {
    const cookie = serializeSessionCookie('tok.en.value');
    expect(cookie.startsWith('pz_admin=tok.en.value;')).toBe(true);
    const attributes = cookie.split('; ').slice(1);
    expect(attributes).toEqual(expect.arrayContaining(['Max-Age=43200', 'Path=/', 'HttpOnly', 'SameSite=Lax']));
    expect(attributes).not.toContain('Secure');
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('meets the __Host- rules in production: Secure, Path=/, no Domain', () => {
    setEnv({ NODE_ENV: 'production' });
    const cookie = serializeSessionCookie('tok.en.value');
    expect(cookie.startsWith('__Host-pz_admin=tok.en.value;')).toBe(true);
    const attributes = cookie.split('; ').slice(1);
    expect(attributes).toEqual(expect.arrayContaining(['Secure', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=43200']));
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('is cleared by an expired cookie with the same attributes', () => {
    for (const env of [{}, { NODE_ENV: 'production' }]) {
      setEnv(env);
      const cookie = serializeClearedSessionCookie();
      expect(cookie.startsWith(`${sessionCookieName()}=;`)).toBe(true);
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie.includes('Secure')).toBe(env.NODE_ENV === 'production');
    }
  });
});

describe('getCookieValue', () => {
  it('finds one cookie among several', () => {
    expect(getCookieValue('a=1; pz_admin=tok.en; b=2', 'pz_admin')).toBe('tok.en');
    expect(getCookieValue('pz_admin=first;pz_admin=second', 'pz_admin')).toBe('first');
    expect(getCookieValue('  pz_admin = spaced  ', 'pz_admin')).toBe('spaced');
  });

  it('matches the whole name only', () => {
    expect(getCookieValue('x_pz_admin=nope; pz_admin_x=nope', 'pz_admin')).toBeUndefined();
  });

  it('copes with a missing header, a missing cookie and quoted values', () => {
    expect(getCookieValue(null, 'pz_admin')).toBeUndefined();
    expect(getCookieValue(undefined, 'pz_admin')).toBeUndefined();
    expect(getCookieValue('', 'pz_admin')).toBeUndefined();
    expect(getCookieValue('a=1', 'pz_admin')).toBeUndefined();
    expect(getCookieValue('pz_admin="quoted"', 'pz_admin')).toBe('quoted');
  });
});
