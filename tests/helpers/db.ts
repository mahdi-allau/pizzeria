import { createPgliteDb } from '@/db/client';
import type { DbHandle } from '@/db/client';
import { seedCatalog } from '@/db/seed';

/**
 * A throwaway in-memory Postgres (PGlite) with every migration applied, optionally seeded.
 * Each test file gets its own, so tests are isolated and never touch a real database.
 */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<DbHandle> {
  const handle = await createPgliteDb({ memory: true });
  if (options.seed) await seedCatalog(handle.db);
  return handle;
}
