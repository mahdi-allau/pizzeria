import { ALLERGEN_CODES, type AllergenCode } from '@/domain/allergens';
import { it } from '@/i18n/it';

/**
 * Italian names of the 14 EU allergens (Reg. UE 1169/2011).
 * Taken from the website dictionary on purpose: the customer must read the same words in the shop and in the email.
 */
export const ALLERGEN_LABELS_IT: Record<AllergenCode, string> = it.allergens;

const KNOWN: ReadonlyMap<string, number> = new Map(ALLERGEN_CODES.map((code, index) => [code, index]));

/** Italian name of an allergen. An unknown code is shown as-is: an allergen must never disappear from an email. */
export function allergenLabel(code: string): string {
  return (ALLERGEN_LABELS_IT as Record<string, string>)[code] ?? code;
}

/**
 * Union of several allergen lists, known codes first in the regulation's order, then any unknown code in the order
 * met. Unlike the domain's `unionAllergens` it never throws: a bad row in the database must not stop an email.
 */
export function collectAllergens(lists: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const seen = new Set<string>();
  for (const list of lists) for (const code of list) seen.add(code);
  const all = [...seen];
  const known = all.filter((code) => KNOWN.has(code)).sort((a, b) => KNOWN.get(a)! - KNOWN.get(b)!);
  const unknown = all.filter((code) => !KNOWN.has(code));
  return [...known, ...unknown];
}

/** "Glutine, Latte" (already de-duplicated and ordered by `collectAllergens`). */
export function formatAllergenList(codes: ReadonlyArray<string>): string {
  return collectAllergens([codes]).map(allergenLabel).join(', ');
}
