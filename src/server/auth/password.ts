import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing for the admin login. Pure node:crypto, no imports from the app, so `scripts/admin-hash.ts` can use
 * it too.
 *
 * Stored format:  scrypt$N$r$p$saltBase64$hashBase64   (N=16384, r=8, p=1, 16-byte salt, 64-byte key)
 * The parameters travel with the hash, so they can be raised later without breaking existing hashes.
 *
 * The password is NFKC-normalised first, so the same word typed with a precomposed or a decomposed accent matches.
 */

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Bounds for a stored value we are asked to verify: generous, but a malformed or hostile value cannot make the
// server allocate gigabytes (memory is 128 * N * r bytes).
const MAX_MEMORY_FACTOR = 2 ** 20; // N * r
const MAX_PARALLELISM = 4;
const SALT_RANGE = [8, 64] as const;
const KEY_RANGE = [16, 128] as const;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

interface ParsedHash extends ScryptParams {
  salt: Buffer;
  hash: Buffer;
}

function derive(password: string, salt: Buffer, keyLength: number, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFKC'), salt, keyLength, { ...params, maxmem: MAX_MEMORY_BYTES }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error('Cannot hash an empty password');
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Strict base64: rejects anything that does not decode back to exactly the same text. */
function decodeBase64(value: string, [min, max]: readonly [number, number]): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64') !== value) return null;
  return buffer.length >= min && buffer.length <= max ? buffer : null;
}

const isPowerOfTwo = (n: number): boolean => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;

/** Parses a stored hash. Tolerates `\$` for `$` (how the signs must be escaped in `.env` files) and stray whitespace. */
function parse(stored: string): ParsedHash | null {
  const parts = stored.trim().replaceAll('\\$', '$').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const [N, r, p] = [parts[1]!, parts[2]!, parts[3]!].map((part) => (/^[1-9]\d{0,9}$/.test(part) ? Number(part) : NaN)) as [number, number, number];
  if (!isPowerOfTwo(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N * r > MAX_MEMORY_FACTOR || p > MAX_PARALLELISM) return null;

  const salt = decodeBase64(parts[4]!, SALT_RANGE);
  const hash = decodeBase64(parts[5]!, KEY_RANGE);
  return salt && hash ? { N, r, p, salt, hash } : null;
}

export function isValidPasswordHash(stored: string): boolean {
  return parse(stored) !== null;
}

/** Constant-time check of a candidate against a stored hash. A malformed stored value never matches and never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || password.length === 0) return false;
  try {
    const actual = await derive(password, parsed.salt, parsed.hash.length, parsed);
    return timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}
