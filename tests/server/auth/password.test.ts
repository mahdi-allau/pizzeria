import { randomBytes, scryptSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, isValidPasswordHash, verifyPassword } from '@/server/auth/password';

const PASSWORD = 'correct horse battery staple';
let stored: string;
beforeAll(async () => {
  stored = await hashPassword(PASSWORD);
});

/** Builds a stored value by hand with arbitrary parameters, independently of hashPassword. */
function handMade(password: string, params: { N: number; r: number; p: number; saltBytes?: number; keyBytes?: number }): string {
  const salt = randomBytes(params.saltBytes ?? 16);
  const key = scryptSync(password.normalize('NFKC'), salt, params.keyBytes ?? 64, { N: params.N, r: params.r, p: params.p, maxmem: 512 * 1024 * 1024 });
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

describe('hashPassword', () => {
  it('produces scrypt$N$r$p$salt$hash with N=16384, r=8, p=1, a 16-byte salt and a 64-byte key', () => {
    const [scheme, n, r, p, salt, hash, ...extra] = stored.split('$');
    expect(scheme).toBe('scrypt');
    expect([n, r, p]).toEqual(['16384', '8', '1']);
    expect(Buffer.from(salt!, 'base64')).toHaveLength(16);
    expect(Buffer.from(hash!, 'base64')).toHaveLength(64);
    expect(extra).toEqual([]);
  });

  it('is really scrypt: an independent computation gives the same key', () => {
    const [, , , , salt, hash] = stored.split('$');
    const expected = scryptSync(PASSWORD, Buffer.from(salt!, 'base64'), 64, { N: 16384, r: 8, p: 1 });
    expect(expected.toString('base64')).toBe(hash);
  });

  it('is salted: the same password never hashes the same way twice', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(stored);
  });

  it('refuses an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty/i);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects anything else', async () => {
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
    expect(await verifyPassword(`${PASSWORD} `, stored)).toBe(false);
    expect(await verifyPassword(PASSWORD.toUpperCase(), stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('treats equivalent Unicode spellings of a password as the same one (NFKC)', async () => {
    const composed = 'perché-è-già-così'; // precomposed accents
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
    expect(await verifyPassword('perche-e-gia-cosi', hash)).toBe(false);
  });

  it('handles long and emoji passwords', async () => {
    const long = `${'🍕'.repeat(200)}x`;
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });

  it('accepts a hash written with other, still sane, parameters', async () => {
    const other = handMade('pizza margherita', { N: 1024, r: 8, p: 2, saltBytes: 12, keyBytes: 32 });
    expect(await verifyPassword('pizza margherita', other)).toBe(true);
    expect(await verifyPassword('pizza marinara', other)).toBe(false);
  });

  it('accepts the $ signs written as \\$ (how they must be escaped in .env files) and stray whitespace', async () => {
    expect(await verifyPassword(PASSWORD, stored.replaceAll('$', '\\$'))).toBe(true);
    expect(await verifyPassword(PASSWORD, `  ${stored}\n`)).toBe(true);
  });

  it('returns false, never throws, for a stored value that is malformed', async () => {
    const [, n, r, p, salt, hash] = stored.split('$');
    const malformed = [
      '',
      'hunter2',
      'scrypt',
      'scrypt$16384$8$1',
      `scrypt$${n}$${r}$${p}$${salt}`,
      `scrypt$${n}$${r}$${p}$${salt}$${hash}$extra`,
      `bcrypt$${n}$${r}$${p}$${salt}$${hash}`,
      `scrypt$abc$${r}$${p}$${salt}$${hash}`,
      `scrypt$16383$${r}$${p}$${salt}$${hash}`, // N is not a power of two
      `scrypt$0$${r}$${p}$${salt}$${hash}`,
      `scrypt$${n}$0$${p}$${salt}$${hash}`,
      `scrypt$${n}$${r}$0$${salt}$${hash}`,
      `scrypt$${n}$${r}$${p}$!!!$${hash}`,
      `scrypt$${n}$${r}$${p}$${salt}$!!!`,
      `scrypt$${n}$${r}$${p}$$${hash}`,
      `scrypt$${n}$${r}$${p}$${salt}$`,
      `scrypt$${n}$${r}$${p}$${Buffer.alloc(2).toString('base64')}$${hash}`, // salt too short
      `scrypt$${n}$${r}$${p}$${salt}$${Buffer.alloc(4).toString('base64')}`, // key too short
    ];
    for (const value of malformed) {
      expect(await verifyPassword(PASSWORD, value), value).toBe(false);
      expect(isValidPasswordHash(value), value).toBe(false);
    }
  });

  it('refuses parameters that would let a stored value exhaust the server', async () => {
    const [, , , , salt, hash] = stored.split('$');
    for (const params of [`${2 ** 30}$8$1`, `16384$1000$1`, `16384$8$1000`, `${2 ** 20}$8$1`]) {
      const value = `scrypt$${params}$${salt}$${hash}`;
      const started = Date.now();
      expect(await verifyPassword(PASSWORD, value), params).toBe(false);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });
});

describe('isValidPasswordHash', () => {
  it('recognises what hashPassword produces', () => {
    expect(isValidPasswordHash(stored)).toBe(true);
  });

  it('rejects a plain password', () => {
    expect(isValidPasswordHash('pizza')).toBe(false);
  });
});
