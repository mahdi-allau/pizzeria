import { business } from '@/config/business';
import type { Db } from '@/db/client';
import { type PaymentProvider, PaymentsUnavailableError } from '@/server/payments/types';
import { attachPaymentIntent, createPendingOrder } from './create';
import { CheckoutError, type CheckoutErrorCode } from './errors';
import { enforceRateLimit, errorJson, internalError, json, readJsonBody } from './http';
import { checkoutInputSchema, fieldErrors } from './input';

/**
 * POST /api/checkout — see the contract in the README of this module (src/server/orders/index.ts) and below.
 *
 * 200 { orderToken, orderNumber, totalCents, provider, paymentIntentId, clientSecret, publishableKey }
 * 400 INVALID_INPUT {fields} | INVALID_CART · 409 PRICE_MISMATCH {expectedTotalCents, computedTotalCents, cart}
 * 409 SLOT_UNAVAILABLE {reason} · 409 ITEM_UNAVAILABLE {slug} · 409 IDEMPOTENCY_CONFLICT · 423 SHOP_CLOSED {closedMessage}
 * 429 RATE_LIMITED · 503 PAYMENTS_UNAVAILABLE · 500 INTERNAL
 */

export interface CheckoutDeps {
  db: Db;
  now?: Date;
  /** Resolved per request (default getPaymentProvider) so a misconfiguration answers 503 instead of crashing. */
  getProvider: () => PaymentProvider;
}

export const CHECKOUT_RATE_LIMIT = { limit: 10, windowSeconds: 600 } as const;

const STATUS: Record<CheckoutErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_CART: 400,
  ITEM_UNAVAILABLE: 409,
  PRICE_MISMATCH: 409,
  SLOT_UNAVAILABLE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SHOP_CLOSED: 423,
};

const paymentsUnavailable = () =>
  errorJson(503, 'PAYMENTS_UNAVAILABLE', 'Il pagamento online non è disponibile in questo momento. Riprova tra qualche minuto.');

export async function handleCheckout(request: Request, deps: CheckoutDeps): Promise<Response> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  try {
    const limited = await enforceRateLimit(db, request, { name: 'checkout', ...CHECKOUT_RATE_LIMIT, now });
    if (limited) return limited;

    const body = await readJsonBody(request);
    if (body === undefined) return errorJson(400, 'INVALID_INPUT', 'Richiesta non valida.', { fields: {} });
    const parsed = checkoutInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson(400, 'INVALID_INPUT', 'Controlla i dati inseriti.', { fields: fieldErrors(parsed.error) });
    }

    // Resolve the provider BEFORE creating anything, so a misconfiguration never leaves orphan orders.
    const provider = deps.getProvider();
    const { order, reused } = await createPendingOrder(db, parsed.data, { now, provider: provider.id });

    let paymentIntentId = order.paymentIntentId;
    let clientSecret: string | undefined;
    try {
      if (paymentIntentId) {
        clientSecret = (await provider.retrievePayment(paymentIntentId)).clientSecret;
      } else {
        const created = await provider.createPayment({
          orderId: order.id,
          orderNumber: order.number,
          amountCents: order.totalCents,
          currency: 'eur',
          customerEmail: order.customerEmail,
          description: `Ordine #${order.number} – ${business.name}`,
          idempotencyKey: `order:${order.id}`,
        });
        paymentIntentId = created.paymentIntentId;
        clientSecret = created.clientSecret;
        await attachPaymentIntent(db, order.id, paymentIntentId);
      }
    } catch (error) {
      // The order stays (holding its slot); the browser retries with the same clientRequestId and we try again.
      console.error('[checkout] payment provider failed', { orderId: order.id, reused, error });
      return paymentsUnavailable();
    }
    if (!clientSecret) return paymentsUnavailable();

    return json({
      orderToken: order.publicToken,
      orderNumber: order.number,
      totalCents: order.totalCents,
      provider: provider.id,
      paymentIntentId,
      clientSecret,
      publishableKey: provider.publishableKey(),
    });
  } catch (error) {
    if (error instanceof CheckoutError) return errorJson(STATUS[error.code], error.code, error.message, { ...error.details });
    if (error instanceof PaymentsUnavailableError) {
      console.error('[checkout] payments unavailable:', error.message);
      return paymentsUnavailable();
    }
    console.error('[checkout] unexpected error', error);
    return internalError();
  }
}
