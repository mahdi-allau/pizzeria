import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  addCents,
  assertCents,
  formatEUR,
  mulCents,
  roundToStep,
  scalePct,
} from '@/domain/money';

describe('assertCents', () => {
  it.each([0, 1, 650, 1_000_000])('accepts the integer %i', (n) => {
    expect(() => assertCents(n)).not.toThrow();
  });

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2, '3', null, undefined])(
    'rejects %s',
    (n) => {
      expect(() => assertCents(n)).toThrow(MoneyError);
    },
  );

  it('names the offending field in the message', () => {
    expect(() => assertCents(1.5, 'unitPrice')).toThrow(/unitPrice/);
  });
});

describe('addCents / mulCents', () => {
  it('adds any number of integer amounts', () => {
    expect(addCents()).toBe(0);
    expect(addCents(100, 250, 5)).toBe(355);
  });

  it('refuses fractional amounts instead of silently rounding', () => {
    expect(() => addCents(100, 0.5)).toThrow(MoneyError);
  });

  it('multiplies by an integer quantity', () => {
    expect(mulCents(450, 3)).toBe(1350);
    expect(mulCents(450, 0)).toBe(0);
  });

  it('rejects fractional or negative quantities', () => {
    expect(() => mulCents(450, 1.5)).toThrow(MoneyError);
    expect(() => mulCents(450, -1)).toThrow(MoneyError);
  });
});

describe('scalePct', () => {
  it('scales by an integer percentage using only integer arithmetic', () => {
    expect(scalePct(150, 100)).toBe(150);
    expect(scalePct(150, 80)).toBe(120);
    expect(scalePct(150, 130)).toBe(195);
  });

  it('rounds half up', () => {
    expect(scalePct(1, 50)).toBe(1); // 0.5 -> 1
    expect(scalePct(1, 49)).toBe(0); // 0.49 -> 0
  });

  it('rejects a fractional percentage', () => {
    expect(() => scalePct(150, 99.5)).toThrow(MoneyError);
  });
});

describe('roundToStep', () => {
  it('rounds to the nearest step, halves going up', () => {
    expect(roundToStep(195, 10)).toBe(200);
    expect(roundToStep(194, 10)).toBe(190);
    expect(roundToStep(120, 10)).toBe(120);
  });

  it('supports other steps', () => {
    expect(roundToStep(112, 5)).toBe(110);
    expect(roundToStep(113, 5)).toBe(115);
  });

  it('rejects a non-positive step', () => {
    expect(() => roundToStep(100, 0)).toThrow(MoneyError);
  });
});

describe('formatEUR', () => {
  // Intl uses a no-break space before the euro sign; normalise so the test reads naturally.
  const fmt = (cents: number) => formatEUR(cents).replace(/ /g, ' ');

  it('formats Italian style with comma decimals', () => {
    expect(fmt(650)).toBe('6,50 €');
    expect(fmt(0)).toBe('0,00 €');
    expect(fmt(5)).toBe('0,05 €');
  });

  it('groups thousands with a dot', () => {
    expect(fmt(1_000_000)).toBe('10.000,00 €');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatEUR(6.5)).toThrow(MoneyError);
  });
});
