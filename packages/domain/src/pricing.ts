import { type Cents, addCents, cents, mulCents } from './money.js';

/** Maximum quantity allowed on a single order line. */
export const MAX_LINE_QUANTITY = 50;

export interface CatalogOption {
  optionId: string;
  name: string;
  priceCents: Cents;
  available: boolean;
}

export interface CatalogItem {
  posItemId: string;
  name: string;
  priceCents: Cents;
  available: boolean;
  options: CatalogOption[];
}

export interface CatalogSnapshot {
  id: string;
  fetchedAt: Date;
  items: CatalogItem[];
}

export interface OrderInput {
  clientOrderId: string;
  lines: { posItemId: string; quantity: number; optionIds: string[]; note?: string }[];
  /** Client-side total; only compared against the backend total, never used for pricing. */
  expectedTotalCents?: number;
}

export interface PricedLine {
  posItemId: string;
  quantity: number;
  unitPriceCents: Cents;
  options: { optionId: string; priceCents: Cents }[];
  note?: string;
}

export class PriceMismatchError extends Error {
  readonly code = 'PRICE_MISMATCH' as const;
  constructor(
    readonly expectedTotalCents: number,
    readonly computedTotalCents: Cents,
  ) {
    super(`Price mismatch: client expected ${expectedTotalCents}, computed ${computedTotalCents}`);
    this.name = 'PriceMismatchError';
  }
}

export class ItemUnavailableError extends Error {
  readonly code = 'ITEM_UNAVAILABLE' as const;
  constructor(
    readonly posItemId: string,
    readonly optionId?: string,
  ) {
    super(
      optionId === undefined
        ? `Item unavailable: ${posItemId}`
        : `Option unavailable: ${optionId} on item ${posItemId}`,
    );
    this.name = 'ItemUnavailableError';
  }
}

export type InvalidOrderCode = 'EMPTY_ORDER' | 'INVALID_QUANTITY' | 'UNKNOWN_ITEM' | 'UNKNOWN_OPTION';

export class InvalidOrderError extends Error {
  constructor(
    readonly code: InvalidOrderCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

/**
 * Prices an order from the catalog snapshot only. Client-supplied prices are ignored.
 * All-or-nothing: any invalid line throws before a result is returned.
 */
export function priceOrder(
  input: OrderInput,
  snapshot: CatalogSnapshot,
): { lines: PricedLine[]; totalCents: Cents } {
  if (input.lines.length === 0) {
    throw new InvalidOrderError('EMPTY_ORDER', 'Order has no lines');
  }

  const itemsById = new Map(snapshot.items.map((item) => [item.posItemId, item]));
  const lines: PricedLine[] = [];
  let totalCents = cents(0);

  for (const line of input.lines) {
    const { quantity } = line;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw new InvalidOrderError(
        'INVALID_QUANTITY',
        `Quantity must be an integer between 1 and ${MAX_LINE_QUANTITY}, got ${String(quantity)}`,
      );
    }

    const item = itemsById.get(line.posItemId);
    if (item === undefined) {
      throw new InvalidOrderError('UNKNOWN_ITEM', `Unknown item: ${line.posItemId}`);
    }
    if (!item.available) {
      throw new ItemUnavailableError(item.posItemId);
    }

    const optionsById = new Map(item.options.map((o) => [o.optionId, o]));
    const seen = new Set<string>();
    const options: PricedLine['options'] = [];
    let unitPriceCents = item.priceCents;
    for (const optionId of line.optionIds) {
      const option = optionsById.get(optionId);
      if (option === undefined || seen.has(optionId)) {
        throw new InvalidOrderError(
          'UNKNOWN_OPTION',
          `Unknown or duplicated option ${optionId} on item ${item.posItemId}`,
        );
      }
      seen.add(optionId);
      if (!option.available) {
        throw new ItemUnavailableError(item.posItemId, optionId);
      }
      options.push({ optionId, priceCents: option.priceCents });
      unitPriceCents = addCents(unitPriceCents, option.priceCents);
    }

    totalCents = addCents(totalCents, mulCents(unitPriceCents, quantity));
    const priced: PricedLine = { posItemId: item.posItemId, quantity, unitPriceCents, options };
    if (line.note !== undefined) priced.note = line.note;
    lines.push(priced);
  }

  if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== totalCents) {
    throw new PriceMismatchError(input.expectedTotalCents, totalCents);
  }

  return { lines, totalCents };
}
