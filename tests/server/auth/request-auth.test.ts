import { beforeEach, describe, expect, it } from 'vitest';
import { isAdminRequest, requireAdminRequest } from '@/server/auth/request-auth';
import { createSessionToken, sessionCookieName } from '@/server/auth/session';
import { installCleanEnv, setEnv } from './env';

installCleanEnv();

const SECRET = 'k3y-for-tests-0123456789-abcdefghijklmnopqrstuvwxyz';
beforeEach(() => setEnv({ ADMIN_SESSION_SECRET: SECRET }));

const withCookie = (cookie?: string) => new Request('https://pizza.example/api/admin/stream', { headers: cookie ? { cookie } : {} });
const signedIn = async () => withCookie(`theme=dark; ${sessionCookieName()}=${await createSessionToken()}`);

describe('requireAdminRequest', () => {
  it('returns null for a request with a valid session cookie', async () => {
    expect(await requireAdminRequest(await signedIn())).toBeNull();
    expect(await isAdminRequest(await signedIn())).toBe(true);
  });

  it('returns a 401 JSON response without a session', async () => {
    const response = await requireAdminRequest(withCookie());
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(401);
    expect(response!.headers.get('cache-control')).toBe('no-store');
    expect(await response!.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Non autorizzato' } });
  });

  it('rejects a forged, expired or foreign cookie', async () => {
    const old = await createSessionToken({ now: new Date('2020-01-01T00:00:00Z') });
    for (const cookie of [`${sessionCookieName()}=garbage`, `${sessionCookieName()}=${old}`, `other=${await createSessionToken()}`, '']) {
      expect(await isAdminRequest(withCookie(cookie)), cookie).toBe(false);
      expect((await requireAdminRequest(withCookie(cookie)))!.status, cookie).toBe(401);
    }
  });

  it('is strict about the cookie name of the environment: a development cookie means nothing in production', async () => {
    const token = await createSessionToken();
    setEnv({ NODE_ENV: 'production' });
    expect(await isAdminRequest(withCookie(`pz_admin=${token}`))).toBe(false);
    expect(await isAdminRequest(withCookie(`__Host-pz_admin=${token}`))).toBe(true);
  });

  it('answers 401 for everybody when admin sessions are not configured', async () => {
    const token = await createSessionToken();
    setEnv({ NODE_ENV: 'production', ADMIN_SESSION_SECRET: undefined });
    expect((await requireAdminRequest(withCookie(`__Host-pz_admin=${token}`)))!.status).toBe(401);
  });
});
