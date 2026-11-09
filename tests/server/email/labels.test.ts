import { describe, expect, it } from 'vitest';
import { ALLERGEN_CODES } from '@/domain/allergens';
import { ALLERGEN_LABELS_IT, allergenLabel, collectAllergens, formatAllergenList } from '@/server/email/labels';

describe('ALLERGEN_LABELS_IT', () => {
  it('names every one of the 14 EU allergens in Italian', () => {
    expect(Object.keys(ALLERGEN_LABELS_IT).sort()).toEqual([...ALLERGEN_CODES].sort());
    for (const code of ALLERGEN_CODES) expect(ALLERGEN_LABELS_IT[code].trim().length).toBeGreaterThan(2);
  });

  it('uses the same names as the website', () => {
    expect(ALLERGEN_LABELS_IT).toEqual({
      gluten: 'Glutine',
      crustaceans: 'Crostacei',
      eggs: 'Uova',
      fish: 'Pesce',
      peanuts: 'Arachidi',
      soy: 'Soia',
      milk: 'Latte',
      nuts: 'Frutta a guscio',
      celery: 'Sedano',
      mustard: 'Senape',
      sesame: 'Sesamo',
      sulphites: 'Solfiti',
      lupin: 'Lupini',
      molluscs: 'Molluschi',
    });
  });
});

describe('allergenLabel', () => {
  it('translates a known code', () => {
    expect(allergenLabel('milk')).toBe('Latte');
  });

  it('never hides an unknown code: it falls back to the raw value', () => {
    expect(allergenLabel('kiwi')).toBe('kiwi');
  });
});

describe('collectAllergens', () => {
  it('merges lists in the order of the regulation, without duplicates', () => {
    expect(collectAllergens([['milk', 'gluten'], ['eggs', 'milk'], []])).toEqual(['gluten', 'eggs', 'milk']);
  });

  it('keeps an unknown code (after the known ones) instead of throwing or dropping it', () => {
    expect(collectAllergens([['kiwi', 'milk'], ['gluten']])).toEqual(['gluten', 'milk', 'kiwi']);
  });

  it('returns an empty list when there is nothing to declare', () => {
    expect(collectAllergens([[], []])).toEqual([]);
  });
});

describe('formatAllergenList', () => {
  it('joins Italian names with commas, in regulation order', () => {
    expect(formatAllergenList(['milk', 'gluten', 'fish'])).toBe('Glutine, Pesce, Latte');
  });

  it('is empty for no allergens', () => {
    expect(formatAllergenList([])).toBe('');
  });
});
