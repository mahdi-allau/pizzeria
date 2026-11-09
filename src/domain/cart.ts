import { z } from 'zod';
import { LIMITS } from './limits';

/**
 * Cart input accepted from the browser. By design it carries NO prices: the server prices every line from the
 * database. Unknown keys (e.g. a tampered `unitPriceCents`) are stripped by Zod.
 */

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid slug');

export const pizzaIngredientSchema = z.object({
  slug: slugSchema,
  portions: z.int().min(1).max(LIMITS.maxPortions),
});

export const pizzaConfigSchema = z.object({
  /** Set when the pizza started from a classic menu item (price basis + "Personalizza"). */
  menuSlug: slugSchema.optional(),
  size: slugSchema,
  dough: slugSchema,
  sauce: slugSchema,
  ingredients: z.array(pizzaIngredientSchema).max(LIMITS.maxIngredientsPerPizza + 8),
  /** Random string picked by the browser per pizza: makes the topping layout reproducible on every screen. */
  seed: z
    .string()
    .regex(/^[a-z0-9]{4,32}$/)
    .optional(),
});

const quantity = z.int().min(1).max(LIMITS.maxQuantityPerLine);
const notes = z.string().trim().max(LIMITS.maxNoteLength).optional();

const pizzaLineSchema = z.object({
  type: z.literal('pizza'),
  pizza: pizzaConfigSchema,
  quantity,
  notes,
});

const productLineSchema = z.object({
  type: z.literal('product'),
  slug: slugSchema,
  quantity,
  notes,
});

/** Removes the `notes` key entirely when it is blank, so stored JSON stays clean. */
function dropBlankNotes<T extends { notes?: string | undefined }>(line: T): T {
  if (line.notes === undefined || line.notes !== '') return line;
  const { notes: _blank, ...rest } = line;
  return rest as T;
}

export const cartLineSchema = z.discriminatedUnion('type', [pizzaLineSchema, productLineSchema]).transform(dropBlankNotes);

export const cartSchema = z.array(cartLineSchema).min(1).max(LIMITS.maxLines);

export type PizzaConfig = z.infer<typeof pizzaConfigSchema>;
export type PizzaIngredientInput = z.infer<typeof pizzaIngredientSchema>;
export type CartLineInput = z.infer<typeof cartLineSchema>;
export type CartInput = z.infer<typeof cartSchema>;
