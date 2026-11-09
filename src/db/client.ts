import fs from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
// NB: relative imports only in src/db (shared with drizzle-kit and tsx scripts).
import { devFeaturesEnabled, getEnv } from '../env';
import * as schema from './schema';

/**
 * One Drizzle handle, two engines:
 *  - DATABASE_URL set  → real Postgres (Neon / Supabase / any) through postgres-js.
 *  - otherwise, in dev → embedded PGlite (Postgres compiled to WASM), auto-migrated and auto-seeded, so
 *    `npm run dev` needs no database server at all.
 * Production without DATABASE_URL is a configuration error, never a silent fallback.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  db: Db;
  kind: 'postgres' | 'pglite';
  close(): Promise<void>;
  /** Applies the SQL migrations in ./drizzle (idempotent). */
  migrate(): Promise<void>;
}

const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

export async function createPgliteDb(options: { memory?: boolean; dataDir?: string } = {}): Promise<DbHandle> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  const dataDir = options.memory ? undefined : (options.dataDir ?? path.join(process.cwd(), '.data', 'pglite'));
  if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const orm = drizzle({ client, schema });
  const handle: DbHandle = {
    db: orm as unknown as Db,
    kind: 'pglite',
    close: () => client.close(),
    migrate: () => migrate(orm, { migrationsFolder: migrationsFolder() }),
  };
  await handle.migrate();
  return handle;
}

export async function createPostgresDb(url: string, options: { max?: number } = {}): Promise<DbHandle> {
  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
    import('postgres'),
    import('drizzle-orm/postgres-js'),
    import('drizzle-orm/postgres-js/migrator'),
  ]);
  // prepare:false keeps us compatible with transaction poolers (Neon pooler, Supabase port 6543).
  const client = postgres(url, { max: options.max ?? 5, prepare: false, idle_timeout: 20, connect_timeout: 15 });
  const orm = drizzle(client, { schema });
  return {
    db: orm as unknown as Db,
    kind: 'postgres',
    close: () => client.end(),
    migrate: () => migrate(orm, { migrationsFolder: migrationsFolder() }),
  };
}

const globalForDb = globalThis as unknown as { __pizzeriaDb?: Promise<DbHandle> };

async function bootstrap(): Promise<DbHandle> {
  const env = getEnv();
  if (env.DATABASE_URL) return createPostgresDb(env.DATABASE_URL);

  if (!devFeaturesEnabled()) {
    throw new Error(
      'DATABASE_URL is not set. Set it to a Postgres connection string (Neon, Supabase...) — see README. ' +
        'The embedded development database is disabled outside development.',
    );
  }

  const handle = await createPgliteDb({ dataDir: env.PGLITE_DATA_DIR });
  const { seedIfEmpty } = await import('./seed');
  await seedIfEmpty(handle.db);
  return handle;
}

/** Process-wide singleton (survives Next.js dev hot reloads via globalThis). */
export function getDbHandle(): Promise<DbHandle> {
  globalForDb.__pizzeriaDb ??= bootstrap().catch((error) => {
    globalForDb.__pizzeriaDb = undefined; // allow a retry on the next request
    throw error;
  });
  return globalForDb.__pizzeriaDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
