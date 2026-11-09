import type { SlotRejection } from '@/domain/slots';

/**
 * Typed checkout failures. `code` is stable (the UI switches on it), `message` is Italian and safe to show,
 * `details` carries the extra data each code promises (see the HTTP contract in ./http.ts).
 */
export type CheckoutErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CART'
  | 'ITEM_UNAVAILABLE'
  | 'PRICE_MISMATCH'
  | 'SLOT_UNAVAILABLE'
  | 'SHOP_CLOSED'
  | 'IDEMPOTENCY_CONFLICT';

export interface PriceMismatchCart {
  lines: { name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  totalCents: number;
}

export interface CheckoutErrorDetails {
  slug?: string;
  reason?: SlotRejection;
  closedMessage?: string | null;
  expectedTotalCents?: number;
  computedTotalCents?: number;
  cart?: PriceMismatchCart;
}

const DEFAULT_MESSAGES: Record<CheckoutErrorCode, string> = {
  INVALID_INPUT: 'Alcuni dati non sono validi.',
  INVALID_CART: 'Il carrello contiene una scelta non valida. Controlla le pizze e riprova.',
  ITEM_UNAVAILABLE: 'Un prodotto nel carrello non è più disponibile.',
  PRICE_MISMATCH: 'I prezzi sono cambiati: controlla il nuovo totale prima di pagare.',
  SLOT_UNAVAILABLE: "L'orario scelto non è più disponibile. Scegline un altro.",
  SHOP_CLOSED: 'Al momento non accettiamo ordini online.',
  IDEMPOTENCY_CONFLICT: 'Questo ordine è già stato inviato con dati diversi. Ricarica la pagina e riprova.',
};

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly details: CheckoutErrorDetails = {},
    message: string = DEFAULT_MESSAGES[code],
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(readonly orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}

/** An operation that is not possible in the order's current state (e.g. refunding an unpaid order). */
export class OrderStateError extends Error {
  constructor(
    readonly code: 'NOT_REFUNDABLE',
    message: string,
  ) {
    super(message);
    this.name = 'OrderStateError';
  }
}
