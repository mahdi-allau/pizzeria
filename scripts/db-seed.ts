/**
 * Loads the starter Italian catalog and default settings.
 *
 *   npm run db:seed              inserts only what is missing (safe: keeps your edits)
 *   npm run db:seed -- --force   RESETS every seeded row to the starter values (loses edits to those rows)
 */
import { createPgliteDb, createPostgresDb } from '../src/db/client';
import { seedCatalog } from '../src/db/seed';

async function main() {
  const overwrite = process.argv.includes('--force');
  const url = process.env.DATABASE_URL;
  const handle = url ? await createPostgresDb(url, { max: 1 }) : await createPgliteDb();
  try {
    await handle.migrate();
    await seedCatalog(handle.db, { overwrite });
    console.log(`Catalog seeded (${handle.kind}${overwrite ? ', overwrite' : ''}).`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
