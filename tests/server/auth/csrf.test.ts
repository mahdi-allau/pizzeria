import { describe, expect, it } from 'vitest';
import { assertSameOrigin, isSameOrigin } from '@/server/auth/csrf';

const post = (headers: Record<string, string>, url = 'https://pizza.example/api/admin/login') => new Request(url, { method: 'POST', headers });

describe('isSameOrigin: the Origin header', () => {
  it('accepts the site posting to itself', () => {
    expect(isSameOrigin(post({ host: 'pizza.example', origin: 'https://pizza.example' }))).toBe(true);
    expect(isSameOrigin(post({ host: 'localhost:3000', origin: 'http://localhost:3000' }, 'http://localhost:3000/api/admin/login'))).toBe(true);
  });

  it('rejects another site', () => {
    expect(isSameOrigin(post({ host: 'pizza.example', origin: 'https://evil.example' }))).toBe(false);
  });

  it('rejects hosts that merely look like ours', () => {
    for (const origin of [
      'https://pizza.example.evil.com',
      'https://evilpizza.example',
      'https://pizza.example@evil.com',
      'https://evil.com/pizza.example',
      'https://pizza.example:8443',
      'https://sub.pizza.example',
    ]) {
      expect(isSameOrigin(post({ host: 'pizza.example', origin })), origin).toBe(false);
    }
  });

  it('rejects "null" (sandboxed frames, cross-origin redirects) and anything that is not an http(s) origin', () => {
    for (const origin of ['null', 'not a url', 'ftp://pizza.example', 'javascript:alert(1)', '']) {
      expect(isSameOrigin(post({ host: 'pizza.example', origin })), origin).toBe(false);
    }
  });

  it('ignores case and default ports', () => {
    expect(isSameOrigin(post({ host: 'Pizza.Example', origin: 'https://PIZZA.example' }))).toBe(true);
    expect(isSameOrigin(post({ host: 'pizza.example:443', origin: 'https://pizza.example' }))).toBe(true);
    expect(isSameOrigin(post({ host: 'pizza.example', origin: 'https://pizza.example:443' }))).toBe(true);
  });
});

describe('isSameOrigin: Referer fallback', () => {
  it('uses the Referer when there is no Origin', () => {
    expect(isSameOrigin(post({ host: 'pizza.example', referer: 'https://pizza.example/admin/login' }))).toBe(true);
    expect(isSameOrigin(post({ host: 'pizza.example', referer: 'https://evil.example/pizza.example' }))).toBe(false);
    expect(isSameOrigin(post({ host: 'pizza.example', referer: 'garbage' }))).toBe(false);
  });

  it('lets the Origin decide when both are present', () => {
    expect(isSameOrigin(post({ host: 'pizza.example', origin: 'https://evil.example', referer: 'https://pizza.example/' }))).toBe(false);
    expect(isSameOrigin(post({ host: 'pizza.example', origin: 'https://pizza.example', referer: 'https://evil.example/' }))).toBe(true);
  });

  it('requires one of the two: a state-changing request with neither is refused', () => {
    expect(isSameOrigin(post({ host: 'pizza.example' }))).toBe(false);
  });
});

describe('isSameOrigin: which host is "ours"', () => {
  it('trusts x-forwarded-host (the public name behind a proxy) over the internal Host', () => {
    const behindProxy = { host: 'localhost:3000', 'x-forwarded-host': 'pizza.example' };
    expect(isSameOrigin(post({ ...behindProxy, origin: 'https://pizza.example' }))).toBe(true);
    expect(isSameOrigin(post({ ...behindProxy, origin: 'http://localhost:3000' }))).toBe(false);
  });

  it('takes the first of several forwarded hosts', () => {
    expect(isSameOrigin(post({ host: 'x', 'x-forwarded-host': 'pizza.example, proxy.internal', origin: 'https://pizza.example' }))).toBe(true);
  });

  it('falls back to the host of the request URL when there is no Host header at all', () => {
    expect(isSameOrigin(new Request('http://localhost:3000/api/admin/login', { method: 'POST', headers: { origin: 'http://localhost:3000' } }))).toBe(true);
    expect(isSameOrigin(new Request('http://localhost:3000/api/admin/login', { method: 'POST', headers: { origin: 'http://evil.example' } }))).toBe(false);
  });
});

describe('assertSameOrigin', () => {
  it('returns null when the request may go on', () => {
    expect(assertSameOrigin(post({ host: 'pizza.example', origin: 'https://pizza.example' }))).toBeNull();
  });

  it('returns a 403 JSON response otherwise', async () => {
    const response = assertSameOrigin(post({ host: 'pizza.example', origin: 'https://evil.example' }));
    expect(response).toBeInstanceOf(Response);
    expect(response!.status).toBe(403);
    expect(response!.headers.get('cache-control')).toBe('no-store');
    expect(await response!.json()).toEqual({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Richiesta non consentita da questo sito' } });
  });
});
