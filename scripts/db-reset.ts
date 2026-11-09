/**
 * Deletes the embedded development database (.data/pglite) so the next `npm run dev` starts from a fresh seed.
 * Refuses to run when DATABASE_URL is set: it never touches a real database.
 *
 *   npm run db:reset
 */
import fs from 'node:fs';
import path from 'node:path';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set: db:reset only removes the embedded dev database and will not touch it.');
  process.exit(1);
}

const dir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pglite');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. The next start re-creates and re-seeds it.`);
