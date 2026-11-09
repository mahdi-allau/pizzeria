import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': `${root}src`,
      // `server-only` throws outside the Next.js server bundle; stub it for unit/integration tests.
      'server-only': `${root}tests/stubs/server-only.ts`,
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
