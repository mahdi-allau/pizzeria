import { count, getTableColumns, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Db, Tx } from '../client';
import { defaultSettingsValues } from '../defaults';
import * as s from '../schema';
import * as data from './data';

type Writer = Db | Tx;

/** `SET col = excluded.col` for every non-key column, so a forced re-seed resets rows to the seed values. */
function excludedSet(table: PgTable): Record<string, ReturnType<typeof sql.raw>> {
  const columns = getTableColumns(table) as Record<string, { name: string; primary: boolean }>;
  return Object.fromEntries(
    Object.entries(columns)
      .filter(([, column]) => !column.primary)
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  );
}

async function upsert<T extends PgTable>(
  tx: Writer,
  table: T,
  rows: T['$inferInsert'][],
  target: PgColumn | PgColumn[],
  overwrite: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const insert = tx.insert(table).values(rows);
  if (overwrite) await insert.onConflictDoUpdate({ target, set: excludedSet(table) });
  else await insert.onConflictDoNothing();
}

export interface SeedOptions {
  /**
   * false (default): only INSERT what is missing, so the pizzeria's edits (prices, sold-out flags...) survive.
   * true: reset every seeded row to its seed value.
   */
  overwrite?: boolean;
}

/** Loads the starter catalog and the default settings. Safe to run any number of times. */
export async function seedCatalog(db: Db, { overwrite = false }: SeedOptions = {}): Promise<void> {
  await db.transaction(async (tx) => {
    await upsert(tx, s.sauces, data.sauces, s.sauces.slug, overwrite);
    await upsert(tx, s.sizes, data.sizes, s.sizes.slug, overwrite);
    await upsert(tx, s.doughs, data.doughs, s.doughs.slug, overwrite);
    await upsert(tx, s.ingredients, data.ingredients, s.ingredients.slug, overwrite);

    await upsert(
      tx,
      s.menuPizzas,
      data.menuPizzas.map(({ slug, name, description, sauceSlug, badges, seed, available, active, sortOrder }) => ({
        slug,
        name,
        description,
        sauceSlug,
        badges,
        seed,
        available,
        active,
        sortOrder,
      })),
      s.menuPizzas.slug,
      overwrite,
    );

    await upsert(
      tx,
      s.menuPizzaPrices,
      data.menuPizzas.flatMap((p) => Object.entries(p.prices).map(([sizeSlug, priceCents]) => ({ pizzaSlug: p.slug, sizeSlug, priceCents }))),
      [s.menuPizzaPrices.pizzaSlug, s.menuPizzaPrices.sizeSlug],
      overwrite,
    );

    if (overwrite) await tx.delete(s.menuPizzaIngredients);
    await upsert(
      tx,
      s.menuPizzaIngredients,
      data.menuPizzas.flatMap((p) =>
        p.recipe.map((r, position) => ({ pizzaSlug: p.slug, ingredientSlug: r.ingredientSlug, portions: r.portions, position })),
      ),
      [s.menuPizzaIngredients.pizzaSlug, s.menuPizzaIngredients.ingredientSlug],
      false,
    );

    await upsert(tx, s.products, data.products, s.products.slug, overwrite);
    await upsert(tx, s.settings, [defaultSettingsValues()], s.settings.id, overwrite);
  });
}

export async function isSeeded(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(s.sizes);
  return (row?.n ?? 0) > 0;
}

/** Used by the embedded dev database: seed only when it is brand new. */
export async function seedIfEmpty(db: Db): Promise<void> {
  if (!(await isSeeded(db))) await seedCatalog(db);
}
