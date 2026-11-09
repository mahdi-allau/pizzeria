/** What the checkout and order services need from a payment provider (Stripe in test mode, or the dev mock). */

export interface CreatePaymentParams {
  orderId: string;
  orderNumber: number;
  amountCents: number;
  currency: 'eur';
  customerEmail: string;
  /** Shown on the Stripe dashboard / statement, e.g. "Ordine #1042 – Pizzeria La Brace". */
  description: string;
  /** Same key → same PaymentIntent (Stripe idempotency). Use `order:<orderId>`. */
  idempotencyKey: string;
}

export interface CreatedPayment {
  paymentIntentId: string;
  clientSecret: string;
}

export interface RetrievedPayment {
  id: string;
  /** Stripe PaymentIntent status, e.g. requires_payment_method | processing | succeeded | canceled. */
  status: string;
  clientSecret?: string;
}

export interface PaymentProvider {
  readonly id: 'stripe' | 'mock';
  createPayment(params: CreatePaymentParams): Promise<CreatedPayment>;
  retrievePayment(paymentIntentId: string): Promise<RetrievedPayment>;
  cancelPayment(paymentIntentId: string): Promise<void>;
  /** Full refund when `amountCents` is omitted. */
  refund(paymentIntentId: string, amountCents?: number): Promise<{ id: string }>;
  /** Stripe publishable key for the Payment Element (null for the mock provider). */
  publishableKey(): string | null;
}

export class PaymentsUnavailableError extends Error {
  readonly code = 'PAYMENTS_UNAVAILABLE' as const;
  constructor(message = 'Payments are not configured') {
    super(message);
    this.name = 'PaymentsUnavailableError';
  }
}
