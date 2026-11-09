/**
 * Applies the SQL migrations in ./drizzle to the database in DATABASE_URL
 * (or to the embedded dev database when it is unset).
 *
 *   npm run db:migrate
 */
import { createPgliteDb, createPostgresDb } from '../src/db/client';

async function main() {
  const url = process.env.DATABASE_URL;
  const handle = url ? await createPostgresDb(url, { max: 1 }) : await createPgliteDb();
  try {
    await handle.migrate();
    console.log(`Migrations applied (${handle.kind}).`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
