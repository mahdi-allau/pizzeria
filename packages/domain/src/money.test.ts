import { describe, expect, it } from 'vitest';
import { addCents, cents, mulCents, MoneyError } from './money.js';

describe('cents', () => {
  it('returns the integer unchanged', () => {
    expect(cents(1250)).toBe(1250);
  });
  it('accepts zero', () => {
    expect(cents(0)).toBe(0);
  });
  it('rejects fractional values', () => {
    expect(() => cents(1.5)).toThrow(MoneyError);
  });
  it('rejects negative values', () => {
    expect(() => cents(-1)).toThrow(MoneyError);
  });
  it('rejects values beyond the safe integer range', () => {
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });
  it('rejects NaN and Infinity', () => {
    expect(() => cents(Number.NaN)).toThrow(MoneyError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('addCents', () => {
  it('adds two amounts', () => {
    expect(addCents(cents(100), cents(250))).toBe(350);
  });
  it('rejects a sum beyond the safe integer range', () => {
    expect(() => addCents(cents(Number.MAX_SAFE_INTEGER), cents(1))).toThrow(MoneyError);
  });
});

describe('mulCents', () => {
  it('multiplies by an integer quantity', () => {
    expect(mulCents(cents(850), 3)).toBe(2550);
  });
  it('rejects a fractional quantity', () => {
    expect(() => mulCents(cents(850), 0.5)).toThrow(MoneyError);
  });
  it('rejects a negative quantity', () => {
    expect(() => mulCents(cents(850), -1)).toThrow(MoneyError);
  });
});
