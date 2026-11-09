import { createHmac, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { devFeaturesEnabled, getEnv } from '@/env';
import type { CreatePaymentParams, CreatedPayment, PaymentProvider, RetrievedPayment } from './types';
import { PaymentsUnavailableError } from './types';

/**
 * DEV ONLY payment provider: lets the whole checkout → webhook → kitchen flow run offline.
 * Stateless and deterministic: the PaymentIntent id derives from the order id and the client secret is an HMAC of
 * the id, so `retrievePayment` can recompute it. Payment outcomes are simulated by /api/dev/mock-pay, which signs a
 * Stripe-shaped event with `signMockEvent` and feeds it to the REAL webhook handler.
 */

export const DEFAULT_MOCK_WEBHOOK_SECRET = 'whsec_mock_dev_only';

export function mockWebhookSecret(): string {
  return getEnv().MOCK_WEBHOOK_SECRET ?? DEFAULT_MOCK_WEBHOOK_SECRET;
}

const secretFor = (paymentIntentId: string) =>
  `${paymentIntentId}_secret_${createHmac('sha256', mockWebhookSecret()).update(paymentIntentId).digest('base64url').slice(0, 24)}`;

export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock' as const;

  constructor() {
    if (!devFeaturesEnabled()) throw new PaymentsUnavailableError('The mock payment provider is disabled outside development');
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatedPayment> {
    const paymentIntentId = `pi_mock_${params.orderId.replace(/-/g, '')}`;
    return { paymentIntentId, clientSecret: secretFor(paymentIntentId) };
  }

  async retrievePayment(paymentIntentId: string): Promise<RetrievedPayment> {
    return { id: paymentIntentId, status: 'requires_payment_method', clientSecret: secretFor(paymentIntentId) };
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    void paymentIntentId; // nothing to cancel: the mock keeps no state
  }

  async refund(paymentIntentId: string, amountCents?: number): Promise<{ id: string }> {
    void paymentIntentId;
    void amountCents;
    return { id: `re_mock_${randomBytes(8).toString('hex')}` };
  }

  publishableKey(): string | null {
    return null;
  }
}

/**
 * Serialises and signs a Stripe-shaped event with the mock webhook secret (real Stripe signature scheme), so it
 * passes the same `stripe.webhooks.constructEvent` check as a real delivery.
 */
export function signMockEvent(event: object, options: { timestamp?: number; secret?: string } = {}): { body: string; signature: string } {
  const body = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: options.secret ?? mockWebhookSecret(),
    ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
  });
  return { body, signature };
}
