import { describe, expect, it } from 'vitest';
import { decideAdminAccess, safeAdminNext } from '@/server/auth/access';

const anonymous = (pathname: string, search = '') => decideAdminAccess({ pathname, search, hasValidSession: false });
const loggedIn = (pathname: string, search = '') => decideAdminAccess({ pathname, search, hasValidSession: true });

describe('decideAdminAccess: signed-out visitors', () => {
  it('lets the login page and the login and logout endpoints through', () => {
    for (const pathname of ['/admin/login', '/admin/login/', '/api/admin/login', '/api/admin/login/', '/api/admin/logout']) {
      expect(anonymous(pathname), pathname).toEqual({ action: 'next' });
    }
  });

  it('sends admin pages to the login page, remembering where they were going', () => {
    expect(anonymous('/admin/ordini')).toEqual({ action: 'redirect', location: '/admin/login?next=%2Fadmin%2Fordini' });
    expect(anonymous('/admin/ordini', '?stato=nuovo')).toEqual({ action: 'redirect', location: '/admin/login?next=%2Fadmin%2Fordini%3Fstato%3Dnuovo' });
    expect(anonymous('/admin/ordini/7f0a')).toEqual({ action: 'redirect', location: '/admin/login?next=%2Fadmin%2Fordini%2F7f0a' });
  });

  it('does not add a next parameter for the admin home', () => {
    expect(anonymous('/admin')).toEqual({ action: 'redirect', location: '/admin/login' });
    expect(anonymous('/admin/')).toEqual({ action: 'redirect', location: '/admin/login' });
  });

  it('answers the admin API with 401 instead of a redirect', () => {
    for (const pathname of ['/api/admin', '/api/admin/stream', '/api/admin/orders/123/status', '/api/admin/']) {
      expect(anonymous(pathname), pathname).toEqual({ action: 'unauthorized' });
    }
  });

  it('does not treat sub-paths of the public pages as public', () => {
    for (const pathname of ['/admin/login/extra', '/admin/loginx', '/admin/login-help', '/api/admin/login/x', '/api/admin/logout/x', '/api/admin/loginx']) {
      expect(anonymous(pathname).action, pathname).not.toBe('next');
    }
  });

  it('is not fooled by percent-encoding or letter case', () => {
    expect(anonymous('/admin/%6Frdini').action).toBe('redirect');
    expect(anonymous('/%61dmin/ordini').action).toBe('redirect');
    expect(anonymous('/Admin/ordini').action).toBe('redirect');
    expect(anonymous('/admin/login%2Fextra').action).toBe('redirect');
    expect(anonymous('/api/%61dmin/stream').action).toBe('unauthorized');
    expect(anonymous('/admin/%E0%A4%A').action).toBe('redirect'); // malformed escape: still the admin area
  });

  it('never builds a redirect target outside the admin area', () => {
    for (const pathname of ['/admin//evil.com', '/admin/..%2f..%2fevil', '/admin/%2e%2e/%2e%2e/evil']) {
      expect(anonymous(pathname), pathname).toEqual({ action: 'redirect', location: '/admin/login' });
    }
  });
});

describe('decideAdminAccess: signed-in admin', () => {
  it('goes through everywhere under /admin and /api/admin', () => {
    for (const pathname of ['/admin', '/admin/ordini', '/admin/login', '/api/admin/stream', '/api/admin/login']) {
      expect(loggedIn(pathname), pathname).toEqual({ action: 'next' });
    }
  });
});

describe('decideAdminAccess: the rest of the site', () => {
  it('is not its business', () => {
    for (const pathname of ['/', '/menu', '/ordine/abc', '/administrator', '/api/adminx', '/api/orders/abc', '/api/administrator']) {
      expect(anonymous(pathname), pathname).toEqual({ action: 'next' });
    }
  });
});

describe('safeAdminNext: where to go after logging in', () => {
  const FALLBACK = '/admin';

  it('keeps a path inside the admin area, with its query', () => {
    expect(safeAdminNext('/admin')).toBe('/admin');
    expect(safeAdminNext('/admin/ordini')).toBe('/admin/ordini');
    expect(safeAdminNext('/admin/ordini?stato=nuovo&x=1')).toBe('/admin/ordini?stato=nuovo&x=1');
    expect(safeAdminNext('/admin/menu?q=%C3%A8')).toBe('/admin/menu?q=%C3%A8');
  });

  it('drops the fragment and resolves harmless dot segments', () => {
    expect(safeAdminNext('/admin/ordini/123#note')).toBe('/admin/ordini/123');
    expect(safeAdminNext('/admin/ordini/../impostazioni')).toBe('/admin/impostazioni');
  });

  it('refuses every attempt at an open redirect', () => {
    const attacks = [
      '//evil.com',
      '///evil.com',
      '//evil.com/admin',
      'https://evil.com',
      'http://evil.com/admin',
      'https://pizza.example/admin',
      'javascript:alert(1)',
      'data:text/html,x',
      '/\\evil.com',
      '\\\\evil.com',
      '/admin\\@evil.com',
      '/admin/..//evil.com',
      '/admin/../../evil',
      '/admin/..%2f..%2fevil',
      '/admin//evil.com',
      '/%2F/evil.com',
      '/admin%0d%0aSet-Cookie:%20a=b',
      '/admin\r\nSet-Cookie: a=b',
      '/admin\t/evil',
      ' /admin',
      '/admin ',
      'evil.com',
      'admin',
      '',
    ];
    for (const attack of attacks) expect(safeAdminNext(attack), JSON.stringify(attack)).toBe(FALLBACK);
  });

  it('refuses paths that are not admin pages or that would loop', () => {
    for (const path of ['/', '/menu', '/administrator', '/adminx/ordini', '/api/admin/stream', '/admin/login', '/admin/login/', '/admin/login?next=/admin']) {
      expect(safeAdminNext(path), path).toBe(FALLBACK);
    }
  });

  it('refuses missing, non-string and oversized values', () => {
    expect(safeAdminNext(null)).toBe(FALLBACK);
    expect(safeAdminNext(undefined)).toBe(FALLBACK);
    expect(safeAdminNext(42 as unknown as string)).toBe(FALLBACK);
    expect(safeAdminNext(`/admin/${'a'.repeat(600)}`)).toBe(FALLBACK);
  });

  it('can fall back somewhere else', () => {
    expect(safeAdminNext('//evil.com', '/admin/ordini')).toBe('/admin/ordini');
  });

  it('only ever returns a path under /admin', () => {
    const samples = ['/admin/ordini', '//x', 'https://x', '/admin?x=//y', '/admin/a?next=//evil.com', '/admin/a#//evil.com'];
    for (const sample of samples) expect(safeAdminNext(sample), sample).toMatch(/^\/admin(\/|\?|$)/);
  });
});
