import { describe, expect, it } from 'vitest';
import { ALLERGEN_CODES, UnknownAllergenError, isAllergenCode, unionAllergens } from '@/domain/allergens';

describe('ALLERGEN_CODES', () => {
  it('lists exactly the 14 allergens of Reg. UE 1169/2011 allegato II', () => {
    expect(ALLERGEN_CODES).toHaveLength(14);
    expect(new Set(ALLERGEN_CODES).size).toBe(14);
  });
});

describe('isAllergenCode', () => {
  it('recognises valid and invalid codes', () => {
    expect(isAllergenCode('milk')).toBe(true);
    expect(isAllergenCode('gluten')).toBe(true);
    expect(isAllergenCode('banana')).toBe(false);
    expect(isAllergenCode('')).toBe(false);
  });
});

describe('unionAllergens', () => {
  it('returns an empty list for no input', () => {
    expect(unionAllergens()).toEqual([]);
    expect(unionAllergens([], [])).toEqual([]);
  });

  it('deduplicates across lists', () => {
    expect(unionAllergens(['milk', 'fish'], ['milk'])).toEqual(['fish', 'milk']);
  });

  it('always returns the canonical order, whatever the input order', () => {
    const a = unionAllergens(['milk', 'gluten', 'eggs']);
    const b = unionAllergens(['eggs', 'milk', 'gluten']);
    expect(a).toEqual(b);
    expect(a).toEqual(['gluten', 'eggs', 'milk']);
  });

  it('throws on an unknown code rather than silently hiding an allergen', () => {
    expect(() => unionAllergens(['milk', 'kryptonite'])).toThrow(UnknownAllergenError);
  });
});
