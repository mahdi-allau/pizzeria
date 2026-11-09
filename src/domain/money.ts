/**
 * Money is an integer number of euro cents. Never a fractional number.
 * Prices are IVA inclusa; the site does no VAT arithmetic.
 */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Throws unless `n` is a non-negative safe integer. */
export function assertCents(n: unknown, what = 'amount'): asserts n is number {
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new MoneyError(`${what} must be an integer number of cents, got ${String(n)}`);
  }
  if (n < 0) {
    throw new MoneyError(`${what} must not be negative, got ${n}`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`${what} exceeds the safe integer range, got ${n}`);
  }
}

export function addCents(...values: number[]): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, 'sum');
  return total;
}

export function mulCents(cents: number, quantity: number): number {
  assertCents(cents);
  assertCents(quantity, 'quantity');
  const product = cents * quantity;
  assertCents(product, 'product');
  return product;
}

/** Scales by an integer percentage with integer-only arithmetic, rounding half up. */
export function scalePct(cents: number, pct: number): number {
  assertCents(cents);
  assertCents(pct, 'percentage');
  return Math.floor((cents * pct + 50) / 100);
}

/** Rounds to the nearest multiple of `step` cents, halves going up. */
export function roundToStep(cents: number, step = 10): number {
  assertCents(cents);
  if (!Number.isInteger(step) || step <= 0) {
    throw new MoneyError(`step must be a positive integer, got ${String(step)}`);
  }
  return Math.floor((cents + step / 2) / step) * step;
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** "6,50 €" (the space before the euro sign is a no-break space). */
export function formatEUR(cents: number): string {
  assertCents(cents);
  return eur.format(cents / 100);
}
