import Stripe from 'stripe';
import { getEnv } from '@/env';
import { type CreatePaymentParams, type CreatedPayment, type PaymentProvider, PaymentsUnavailableError, type RetrievedPayment } from './types';

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;

export interface StripeProviderOptions {
  secretKey: string;
  publishableKey?: string | null;
  /** Defaults to env STRIPE_ALLOW_LIVE. The brief is TEST MODE ONLY: live keys are refused unless this is true. */
  allowLive?: boolean;
  /** Test hook: route the SDK's HTTP through a custom client (e.g. `Stripe.createFetchHttpClient(fakeFetch)`). */
  httpClient?: StripeConfig['httpClient'];
}

export const isLiveKey = (key: string) => /^(sk|rk)_live_/.test(key);

/**
 * Stripe PaymentIntents (Payment Element). `automatic_payment_methods` lets Stripe offer cards plus Apple Pay /
 * Google Pay where available. The order id travels in `metadata.orderId`, which is how the webhook finds the order.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe' as const;
  private readonly stripe: Stripe;
  private readonly pk: string | null;

  constructor(options: StripeProviderOptions) {
    const allowLive = options.allowLive ?? getEnv().STRIPE_ALLOW_LIVE === true;
    if (isLiveKey(options.secretKey) && !allowLive) {
      throw new PaymentsUnavailableError('Refusing a live Stripe key: this site runs in Stripe TEST MODE only (set STRIPE_ALLOW_LIVE=true to override).');
    }
    this.stripe = new Stripe(options.secretKey, {
      maxNetworkRetries: options.httpClient ? 0 : 2,
      timeout: 20_000,
      appInfo: { name: 'pizzeria-asporto' },
      ...(options.httpClient ? { httpClient: options.httpClient } : {}),
    });
    this.pk = options.publishableKey ?? null;
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        automatic_payment_methods: { enabled: true },
        description: params.description,
        metadata: { orderId: params.orderId, orderNumber: String(params.orderNumber) },
      },
      { idempotencyKey: params.idempotencyKey },
    );
    if (!intent.client_secret) throw new Error(`PaymentIntent ${intent.id} has no client secret`);
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
  }

  async retrievePayment(paymentIntentId: string): Promise<RetrievedPayment> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return { id: intent.id, status: intent.status, ...(intent.client_secret ? { clientSecret: intent.client_secret } : {}) };
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  async refund(paymentIntentId: string, amountCents?: number): Promise<{ id: string }> {
    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntentId, ...(amountCents !== undefined ? { amount: amountCents } : {}) },
      { idempotencyKey: `refund:${paymentIntentId}:${amountCents ?? 'full'}` },
    );
    return { id: refund.id };
  }

  publishableKey(): string | null {
    return this.pk;
  }
}
