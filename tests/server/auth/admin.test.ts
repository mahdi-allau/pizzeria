import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, sessionCookieName } from '@/server/auth/session';
import { getAdminSession, requireAdmin, requireAdminRequest } from '@/server/auth/admin';
import { installCleanEnv, setEnv } from './env';

/**
 * `cookies()` and `redirect()` only exist inside a Next.js request, so these two framework functions are replaced
 * with stand-ins. Everything else (session verification, cookie names, secrets) is the real code.
 */
const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar.cookies ? { name, value: jar.cookies[name] } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`NEXT_REDIRECT ${location}`);
  },
}));

installCleanEnv();

const SECRET = 'k3y-for-tests-0123456789-abcdefghijklmnopqrstuvwxyz';
beforeEach(() => {
  setEnv({ ADMIN_SESSION_SECRET: SECRET });
  jar.cookies = {};
});

describe('getAdminSession', () => {
  it('is authenticated with a valid session cookie', async () => {
    jar.cookies[sessionCookieName()] = await createSessionToken();
    expect(await getAdminSession()).toEqual({ authenticated: true });
  });

  it('is not authenticated without a cookie, with a bad one or an expired one', async () => {
    expect(await getAdminSession()).toEqual({ authenticated: false });
    jar.cookies[sessionCookieName()] = 'garbage';
    expect(await getAdminSession()).toEqual({ authenticated: false });
    jar.cookies[sessionCookieName()] = await createSessionToken({ now: new Date('2020-01-01T00:00:00Z') });
    expect(await getAdminSession()).toEqual({ authenticated: false });
  });

  it('ignores a cookie with the wrong name', async () => {
    jar.cookies.session = await createSessionToken();
    expect(await getAdminSession()).toEqual({ authenticated: false });
  });
});

describe('requireAdmin', () => {
  it('lets an authenticated admin through', async () => {
    jar.cookies[sessionCookieName()] = await createSessionToken();
    await expect(requireAdmin()).resolves.toBeUndefined();
  });

  it('sends everybody else to the login page', async () => {
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT /admin/login');
    jar.cookies[sessionCookieName()] = 'garbage';
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT /admin/login');
  });
});

describe('requireAdminRequest (re-exported for route handlers)', () => {
  it('answers 401 without a session and null with one', async () => {
    const anonymous = new Request('https://pizza.example/api/admin/x');
    expect((await requireAdminRequest(anonymous))!.status).toBe(401);
    const token = await createSessionToken();
    const authed = new Request('https://pizza.example/api/admin/x', { headers: { cookie: `${sessionCookieName()}=${token}` } });
    expect(await requireAdminRequest(authed)).toBeNull();
  });
});
