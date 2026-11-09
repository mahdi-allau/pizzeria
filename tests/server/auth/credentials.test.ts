import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminNotConfiguredError, DEV_ADMIN_PASSWORD, checkAdminPassword, credentialMode, isAdminConfigured, resetAdminCredentialWarnings } from '@/server/auth/credentials';
import { hashPassword } from '@/server/auth/password';
import { installCleanEnv, setEnv } from './env';

installCleanEnv();

const SESSION_SECRET = 'k3y-for-tests-0123456789-abcdefghijklmnopqrstuvwxyz';

beforeEach(() => {
  resetAdminCredentialWarnings();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ADMIN_PASSWORD_HASH (preferred)', () => {
  it('accepts the password the hash was made from, and nothing else', async () => {
    setEnv({ ADMIN_PASSWORD_HASH: await hashPassword('s3cret passphrase') });
    expect(credentialMode()).toBe('hash');
    expect(await checkAdminPassword('s3cret passphrase')).toBe(true);
    expect(await checkAdminPassword('s3cret passphrasE')).toBe(false);
    expect(await checkAdminPassword('')).toBe(false);
    expect(await checkAdminPassword(DEV_ADMIN_PASSWORD)).toBe(false);
  });

  it('wins over ADMIN_PASSWORD when both are set', async () => {
    setEnv({ ADMIN_PASSWORD_HASH: await hashPassword('from-the-hash'), ADMIN_PASSWORD: 'from-plain' });
    expect(await checkAdminPassword('from-the-hash')).toBe(true);
    expect(await checkAdminPassword('from-plain')).toBe(false);
  });

  it('is treated as a configuration error when it is not a valid hash, never as a password', async () => {
    for (const bad of ['scrypt$mangled', 'pizza', 'scrypt16384881abc']) {
      resetAdminCredentialWarnings();
      setEnv({ ADMIN_PASSWORD_HASH: bad, ADMIN_PASSWORD: 'fallback-must-not-work' });
      expect(credentialMode(), bad).toBe('disabled');
      expect(isAdminConfigured(), bad).toBe(false);
      await expect(checkAdminPassword('fallback-must-not-work')).rejects.toBeInstanceOf(AdminNotConfiguredError);
      await expect(checkAdminPassword(DEV_ADMIN_PASSWORD)).rejects.toBeInstanceOf(AdminNotConfiguredError);
    }
  });

  it('explains the usual cause of a mangled hash (unescaped $ in a .env file), once', async () => {
    setEnv({ ADMIN_PASSWORD_HASH: 'scrypt' });
    credentialMode();
    credentialMode();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.error).mock.calls[0]![0])).toContain('\\$');
  });
});

describe('ADMIN_PASSWORD (plain)', () => {
  it('compares digests, so the length of the secret does not leak and any length works', async () => {
    setEnv({ ADMIN_PASSWORD: 'una password abbastanza lunga' });
    expect(credentialMode()).toBe('plain');
    expect(await checkAdminPassword('una password abbastanza lunga')).toBe(true);
    expect(await checkAdminPassword('una')).toBe(false);
    expect(await checkAdminPassword('una password abbastanza lunga!')).toBe(false);
    expect(await checkAdminPassword('')).toBe(false);
  });

  it('treats equivalent Unicode spellings as equal', async () => {
    setEnv({ ADMIN_PASSWORD: 'perché' });
    expect(await checkAdminPassword('perché'.normalize('NFD'))).toBe(true);
  });
});

describe('development fallback', () => {
  it('accepts the dev password "pizza" when nothing is configured, and warns exactly once', async () => {
    expect(credentialMode()).toBe('dev');
    expect(await checkAdminPassword('pizza')).toBe(true);
    expect(await checkAdminPassword('pizza')).toBe(true);
    expect(await checkAdminPassword('something else')).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.warn).mock.calls[0]![0])).toContain('pizza');
  });

  it('is only available while development helpers are on', async () => {
    for (const env of [{ NODE_ENV: 'production' }, { DEV_FEATURES: 'false' }, { VERCEL_ENV: 'production', DEV_FEATURES: 'true' }]) {
      setEnv({ NODE_ENV: 'test', DEV_FEATURES: undefined, VERCEL_ENV: undefined, ...env });
      expect(credentialMode(), JSON.stringify(env)).toBe('disabled');
      await expect(checkAdminPassword('pizza')).rejects.toBeInstanceOf(AdminNotConfiguredError);
    }
  });

  it('does not apply once a real password is set', async () => {
    setEnv({ ADMIN_PASSWORD: 'real-one' });
    expect(await checkAdminPassword('pizza')).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('isAdminConfigured', () => {
  it('needs both a way to check the password and a usable session secret', async () => {
    setEnv({ NODE_ENV: 'production', ADMIN_PASSWORD_HASH: await hashPassword('x-password') });
    expect(isAdminConfigured()).toBe(false); // no session secret in production
    setEnv({ ADMIN_SESSION_SECRET: SESSION_SECRET });
    expect(isAdminConfigured()).toBe(true);
    setEnv({ ADMIN_PASSWORD_HASH: undefined });
    expect(isAdminConfigured()).toBe(false); // no password
  });

  it('is true out of the box in development', () => {
    expect(isAdminConfigured()).toBe(true);
  });
});
