/**
 * The 14 allergens of Reg. UE 1169/2011, allegato II, in the regulation's own order.
 * Italian display names live in the i18n dictionary, not here.
 */
export const ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type AllergenCode = (typeof ALLERGEN_CODES)[number];

const ORDER: ReadonlyMap<string, number> = new Map(ALLERGEN_CODES.map((code, i) => [code, i]));

export class UnknownAllergenError extends Error {
  constructor(readonly code: string) {
    super(`Unknown allergen code: ${code}`);
    this.name = 'UnknownAllergenError';
  }
}

export function isAllergenCode(value: unknown): value is AllergenCode {
  return typeof value === 'string' && ORDER.has(value);
}

/**
 * Union of allergen lists in canonical order. Unknown codes throw: an allergen must never be dropped silently.
 */
export function unionAllergens(...lists: ReadonlyArray<ReadonlyArray<string>>): AllergenCode[] {
  const seen = new Set<AllergenCode>();
  for (const list of lists) {
    for (const code of list) {
      if (!isAllergenCode(code)) throw new UnknownAllergenError(code);
      seen.add(code);
    }
  }
  return [...seen].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}
