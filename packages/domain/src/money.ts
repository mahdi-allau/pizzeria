/** Money is an integer number of centesimi (cents). Never a fractional number. */
export type Cents = number & { readonly __brand: 'Cents' };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertNonNegativeSafeInteger(n: number, what: string): void {
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new MoneyError(`${what} must be an integer, got ${String(n)}`);
  }
  if (n < 0) {
    throw new MoneyError(`${what} must not be negative, got ${n}`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError(`${what} exceeds the safe integer range, got ${n}`);
  }
}

export function cents(n: number): Cents {
  assertNonNegativeSafeInteger(n, 'cents');
  return n as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function mulCents(a: Cents, qty: number): Cents {
  assertNonNegativeSafeInteger(qty, 'quantity');
  return cents(a * qty);
}
