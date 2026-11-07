import { describe, expect, it } from 'vitest';
import { cents } from './money.js';
import {
  ItemUnavailableError,
  InvalidOrderError,
  MAX_LINE_QUANTITY,
  PriceMismatchError,
  priceOrder,
  type CatalogSnapshot,
  type OrderInput,
} from './pricing.js';

const snapshot: CatalogSnapshot = {
  id: 'snap-1',
  fetchedAt: new Date('2026-11-07T10:00:00Z'),
  items: [
    {
      posItemId: 'margherita',
      name: 'Margherita',
      priceCents: cents(700),
      available: true,
      options: [
        { optionId: 'extra-mozzarella', name: 'Extra mozzarella', priceCents: cents(150), available: true },
        { optionId: 'basil', name: 'Basil', priceCents: cents(50), available: true },
        { optionId: 'out-of-stock-opt', name: 'Truffle', priceCents: cents(300), available: false },
      ],
    },
    {
      posItemId: 'cola',
      name: 'Cola',
      priceCents: cents(300),
      available: true,
      options: [],
    },
    {
      posItemId: 'sold-out',
      name: 'Sold out pizza',
      priceCents: cents(900),
      available: false,
      options: [],
    },
  ],
};

function order(lines: OrderInput['lines'], expectedTotalCents?: number): OrderInput {
  return expectedTotalCents === undefined
    ? { clientOrderId: 'c-1', lines }
    : { clientOrderId: 'c-1', lines, expectedTotalCents };
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected function to throw');
}

describe('priceOrder', () => {
  it('computes unit price as base plus options and total as unit * quantity', () => {
    const r = priceOrder(
      order([{ posItemId: 'margherita', quantity: 2, optionIds: ['extra-mozzarella'] }]),
      snapshot,
    );
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.unitPriceCents).toBe(850);
    expect(r.lines[0]?.options).toEqual([{ optionId: 'extra-mozzarella', priceCents: 150 }]);
    expect(r.totalCents).toBe(1700);
  });

  it('sums multiple lines', () => {
    const r = priceOrder(
      order([
        { posItemId: 'margherita', quantity: 2, optionIds: ['extra-mozzarella'] },
        { posItemId: 'cola', quantity: 3, optionIds: [] },
      ]),
      snapshot,
    );
    expect(r.totalCents).toBe(1700 + 900);
  });

  it('carries the note through', () => {
    const r = priceOrder(
      order([{ posItemId: 'cola', quantity: 1, optionIds: [], note: 'no ice' }]),
      snapshot,
    );
    expect(r.lines[0]?.note).toBe('no ice');
  });

  it('accepts a matching expectedTotalCents', () => {
    const r = priceOrder(
      order([{ posItemId: 'margherita', quantity: 2, optionIds: ['extra-mozzarella'] }], 1700),
      snapshot,
    );
    expect(r.totalCents).toBe(1700);
  });

  it('throws PRICE_MISMATCH when expectedTotalCents differs', () => {
    const e = catchError(() =>
      priceOrder(
        order([{ posItemId: 'margherita', quantity: 2, optionIds: ['extra-mozzarella'] }], 1600),
        snapshot,
      ),
    );
    expect(e).toBeInstanceOf(PriceMismatchError);
    expect(e).toBeInstanceOf(Error);
    expect((e as PriceMismatchError).code).toBe('PRICE_MISMATCH');
  });

  it('throws ITEM_UNAVAILABLE for an unavailable item', () => {
    const e = catchError(() =>
      priceOrder(order([{ posItemId: 'sold-out', quantity: 1, optionIds: [] }]), snapshot),
    );
    expect(e).toBeInstanceOf(ItemUnavailableError);
    expect((e as ItemUnavailableError).code).toBe('ITEM_UNAVAILABLE');
  });

  it('throws ITEM_UNAVAILABLE for an unavailable option', () => {
    const e = catchError(() =>
      priceOrder(
        order([{ posItemId: 'margherita', quantity: 1, optionIds: ['out-of-stock-opt'] }]),
        snapshot,
      ),
    );
    expect(e).toBeInstanceOf(ItemUnavailableError);
    expect((e as ItemUnavailableError).code).toBe('ITEM_UNAVAILABLE');
  });

  it('throws UNKNOWN_ITEM for an unknown item id', () => {
    const e = catchError(() =>
      priceOrder(order([{ posItemId: 'nope', quantity: 1, optionIds: [] }]), snapshot),
    );
    expect(e).toBeInstanceOf(InvalidOrderError);
    expect((e as InvalidOrderError).code).toBe('UNKNOWN_ITEM');
  });

  it('throws UNKNOWN_OPTION for an unknown option id', () => {
    const e = catchError(() =>
      priceOrder(order([{ posItemId: 'margherita', quantity: 1, optionIds: ['nope'] }]), snapshot),
    );
    expect(e).toBeInstanceOf(InvalidOrderError);
    expect((e as InvalidOrderError).code).toBe('UNKNOWN_OPTION');
  });

  it('throws UNKNOWN_OPTION for an option belonging to a different item', () => {
    const e = catchError(() =>
      priceOrder(order([{ posItemId: 'cola', quantity: 1, optionIds: ['basil'] }]), snapshot),
    );
    expect((e as InvalidOrderError).code).toBe('UNKNOWN_OPTION');
  });

  it('rejects a duplicated optionId within a line as UNKNOWN_OPTION', () => {
    const e = catchError(() =>
      priceOrder(
        order([{ posItemId: 'margherita', quantity: 1, optionIds: ['basil', 'basil'] }]),
        snapshot,
      ),
    );
    expect(e).toBeInstanceOf(InvalidOrderError);
    expect((e as InvalidOrderError).code).toBe('UNKNOWN_OPTION');
  });

  it('throws EMPTY_ORDER for no lines', () => {
    const e = catchError(() => priceOrder(order([]), snapshot));
    expect(e).toBeInstanceOf(InvalidOrderError);
    expect((e as InvalidOrderError).code).toBe('EMPTY_ORDER');
  });

  it.each([0, -1, 1.5, 51, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws INVALID_QUANTITY for quantity %s',
    (quantity) => {
      const e = catchError(() =>
        priceOrder(order([{ posItemId: 'cola', quantity, optionIds: [] }]), snapshot),
      );
      expect(e).toBeInstanceOf(InvalidOrderError);
      expect((e as InvalidOrderError).code).toBe('INVALID_QUANTITY');
    },
  );

  it('accepts the boundary quantities 1 and MAX_LINE_QUANTITY', () => {
    expect(MAX_LINE_QUANTITY).toBe(50);
    expect(priceOrder(order([{ posItemId: 'cola', quantity: 1, optionIds: [] }]), snapshot).totalCents).toBe(300);
    expect(
      priceOrder(order([{ posItemId: 'cola', quantity: 50, optionIds: [] }]), snapshot).totalCents,
    ).toBe(15000);
  });

  it('is all-or-nothing: a bad later line fails the whole order', () => {
    expect(() =>
      priceOrder(
        order([
          { posItemId: 'cola', quantity: 1, optionIds: [] },
          { posItemId: 'nope', quantity: 1, optionIds: [] },
        ]),
        snapshot,
      ),
    ).toThrow(InvalidOrderError);
  });

  it('ignores any client-supplied price fields on lines', () => {
    const tampered = {
      clientOrderId: 'c-1',
      lines: [{ posItemId: 'cola', quantity: 1, optionIds: [], unitPriceCents: 1, priceCents: 1 }],
    } as unknown as OrderInput;
    expect(priceOrder(tampered, snapshot).totalCents).toBe(300);
  });
});
