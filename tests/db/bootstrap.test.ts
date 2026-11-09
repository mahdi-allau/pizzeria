import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { business } from '@/config/business';
import * as schema from '@/db/schema';
import { seedCatalog } from '@/db/seed';
import { isAllergenCode, UnknownAllergenError } from '@/domain/allergens';
import { priceLine } from '@/domain/pricing';
import { loadCatalog } from '@/server/catalog';
import { loadSettings, toSlotRules } from '@/server/settings';
import { createTestDb } from '../helpers/db';
import type { DbHandle } from '@/db/client';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

const rows = async (table: PgTable): Promise<number> => {
  const [row] = await handle.db.select({ n: count() }).from(table);
  return row!.n;
};

describe('migrations', () => {
  it('create every table on a fresh embedded Postgres', async () => {
    const tables = [
      schema.settings,
      schema.sizes,
      schema.doughs,
      schema.sauces,
      schema.ingredients,
      schema.menuPizzas,
      schema.menuPizzaPrices,
      schema.menuPizzaIngredients,
      schema.products,
      schema.orders,
      schema.orderItems,
      schema.orderEvents,
      schema.realtimeEvents,
      schema.paymentEvents,
      schema.emailLog,
      schema.rateLimits,
    ];
    for (const table of tables) expect(await rows(table)).toBe(0);
  });

  it('allow only one settings row', async () => {
    const insert = (id: number) =>
      handle.db.insert(schema.settings).values({
        id,
        hours: business.defaults.hours,
        prepMinutes: 20,
        slotCapacity: 8,
        maxDaysAhead: 2,
      });
    await expect(insert(2)).rejects.toThrow();
  });
});

describe('seedCatalog', () => {
  it('loads a complete Italian catalog', async () => {
    await seedCatalog(handle.db);
    expect(await rows(schema.sizes)).toBe(3);
    expect(await rows(schema.doughs)).toBe(3);
    expect(await rows(schema.sauces)).toBe(3);
    expect(await rows(schema.ingredients)).toBeGreaterThanOrEqual(35);
    expect(await rows(schema.menuPizzas)).toBeGreaterThanOrEqual(14);
    expect(await rows(schema.products)).toBeGreaterThanOrEqual(12);
    expect(await rows(schema.settings)).toBe(1);
  });

  it('is idempotent and never overwrites edits made by the pizzeria', async () => {
    await handle.db.update(schema.ingredients).set({ priceCents: 999 }).where(eq(schema.ingredients.slug, 'mozzarella'));
    const before = await rows(schema.ingredients);
    await seedCatalog(handle.db);
    expect(await rows(schema.ingredients)).toBe(before);
    const [m] = await handle.db.select().from(schema.ingredients).where(eq(schema.ingredients.slug, 'mozzarella'));
    expect(m!.priceCents).toBe(999);
  });

  it('can be forced to reset the catalog to the seed values', async () => {
    await seedCatalog(handle.db, { overwrite: true });
    const [m] = await handle.db.select().from(schema.ingredients).where(eq(schema.ingredients.slug, 'mozzarella'));
    expect(m!.priceCents).toBe(150);
  });
});

describe('loadCatalog on the seeded data', () => {
  it('sells every classic pizza in every active size', async () => {
    const catalog = await loadCatalog(handle.db);
    const sizeSlugs = catalog.sizes.filter((s) => s.active).map((s) => s.slug).sort();
    for (const pizza of catalog.menuPizzas) {
      expect(Object.keys(pizza.prices).sort(), pizza.slug).toEqual(sizeSlugs);
    }
  });

  it('prices every classic pizza at exactly its menu price when ordered as written', async () => {
    const catalog = await loadCatalog(handle.db);
    for (const pizza of catalog.menuPizzas) {
      for (const [size, price] of Object.entries(pizza.prices)) {
        const line = priceLine(catalog, {
          type: 'pizza',
          quantity: 1,
          pizza: {
            menuSlug: pizza.slug,
            size,
            dough: 'classica',
            sauce: pizza.sauceSlug,
            ingredients: pizza.recipe.map((r) => ({ slug: r.ingredientSlug, portions: r.portions })),
          },
        });
        expect(line.unitPriceCents, `${pizza.slug}/${size}`).toBe(price);
      }
    }
  });

  it('only references real ingredients in every recipe', async () => {
    const catalog = await loadCatalog(handle.db);
    const known = new Set(catalog.ingredients.map((i) => i.slug));
    for (const pizza of catalog.menuPizzas) {
      for (const r of pizza.recipe) expect(known.has(r.ingredientSlug), `${pizza.slug} -> ${r.ingredientSlug}`).toBe(true);
    }
  });

  it('declares allergens with valid EU codes only, and the classics carry the right ones', async () => {
    const catalog = await loadCatalog(handle.db);
    for (const i of catalog.ingredients) for (const a of i.allergens) expect(isAllergenCode(a), `${i.slug}:${a}`).toBe(true);

    const allergensOf = (menuSlug: string) => {
      const pizza = catalog.menuPizzas.find((p) => p.slug === menuSlug)!;
      return priceLine(catalog, {
        type: 'pizza',
        quantity: 1,
        pizza: {
          menuSlug,
          size: 'media',
          dough: 'classica',
          sauce: pizza.sauceSlug,
          ingredients: pizza.recipe.map((r) => ({ slug: r.ingredientSlug, portions: r.portions })),
        },
      }).allergens;
    };
    expect(allergensOf('margherita')).toEqual(['gluten', 'milk']);
    expect(allergensOf('marinara')).toEqual(['gluten']);
    expect(allergensOf('napoli')).toEqual(['gluten', 'fish', 'milk']);
  });

  it('keeps vegetarian/vegan flags consistent', async () => {
    const catalog = await loadCatalog(handle.db);
    for (const i of catalog.ingredients) {
      if (i.vegan) expect(i.vegetarian, `${i.slug} is vegan so must be vegetarian`).toBe(true);
    }
  });

  it('refuses to load an unknown allergen code instead of hiding it', async () => {
    await handle.db.update(schema.ingredients).set({ allergens: ['kryptonite' as never] }).where(eq(schema.ingredients.slug, 'funghi'));
    await expect(loadCatalog(handle.db)).rejects.toThrow(UnknownAllergenError);
    await handle.db.update(schema.ingredients).set({ allergens: [] }).where(eq(schema.ingredients.slug, 'funghi'));
  });
});

describe('settings', () => {
  it('start from the business defaults', async () => {
    const settings = await loadSettings(handle.db);
    expect(settings.prepMinutes).toBe(business.defaults.prepMinutes);
    expect(settings.slotCapacity).toBe(business.defaults.slotCapacity);
    expect(settings.shopOpen).toBe(true);
    expect(settings.hours.tue).toEqual(business.defaults.hours.tue);
  });

  it('convert to slot rules in the business time zone', async () => {
    const rules = toSlotRules(await loadSettings(handle.db));
    expect(rules.timezone).toBe('Europe/Rome');
    expect(rules.slotMinutes).toBe(15);
  });

  it('recreate the row from defaults if it was ever deleted', async () => {
    await handle.db.delete(schema.settings);
    const settings = await loadSettings(handle.db);
    expect(settings.prepMinutes).toBe(business.defaults.prepMinutes);
    expect(await rows(schema.settings)).toBe(1);
  });
});

describe('orders table', () => {
  it('assigns increasing human-friendly order numbers starting at 1001', async () => {
    const base = {
      customerName: 'Mario Rossi',
      customerPhone: '+393331234567',
      customerEmail: 'mario@example.it',
      pickupAt: new Date('2026-11-10T18:30:00Z'),
      pizzaCount: 1,
      totalCents: 650,
      paymentProvider: 'mock',
    };
    const [a] = await handle.db.insert(schema.orders).values({ ...base, publicToken: 'tok-a' }).returning();
    const [b] = await handle.db.insert(schema.orders).values({ ...base, publicToken: 'tok-b' }).returning();
    expect(a!.number).toBe(1001);
    expect(b!.number).toBe(1002);
    expect(a!.status).toBe('awaiting_payment');
    expect(a!.paymentStatus).toBe('unpaid');
  });

  it('rejects a negative total', async () => {
    await expect(
      handle.db.insert(schema.orders).values({
        customerName: 'X',
        customerPhone: '1',
        customerEmail: 'x@example.it',
        pickupAt: new Date(),
        pizzaCount: 1,
        totalCents: -1,
        paymentProvider: 'mock',
        publicToken: 'tok-neg',
      }),
    ).rejects.toThrow();
  });
});
