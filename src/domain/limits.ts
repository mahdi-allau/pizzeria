/** Hard limits applied to every cart, on client and server. Operational settings (capacity, prep time) live in the DB. */
export const LIMITS = {
  maxQuantityPerLine: 20,
  maxLines: 30,
  maxIngredientsPerPizza: 16,
  /** Global ceiling on portions of one ingredient; each ingredient also has its own maxPortions. */
  maxPortions: 3,
  maxNoteLength: 200,
} as const;

export type Limits = { -readonly [K in keyof typeof LIMITS]: number };
