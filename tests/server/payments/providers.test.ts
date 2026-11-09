import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  MockPaymentProvider,
  PaymentsUnavailableError,
  StripePaymentProvider,
  getPaymentProvider,
  mockWebhookSecret,
  signMockEvent,
} from '@/server/payments';
import { scopedEnv } from './_env';

const setEnv = scopedEnv();

const params = {
  orderId: '6f1c2f0e-8a54-4d3b-9a43-2b1a2b9d7f10',
  orderNumber: 1042,
  amountCents: 1550,
  currency: 'eur' as const,
  customerEmail: 'mario@example.it',
  description: 'Ordine #1042',
  idempotencyKey: 'order:6f1c2f0e-8a54-4d3b-9a43-2b1a2b9d7f10',
};

/** Captures the HTTP requests the real Stripe SDK would send, and answers like the Stripe API would. */
function fakeStripeHttp(respond: (path: string, body: URLSearchParams) => unknown) {
  const requests: { method: string; url: string; headers: Headers; body: URLSearchParams }[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    requests.push({ method: init?.method ?? 'GET', url, headers: new Headers(init?.headers), body });
    return new Response(JSON.stringify(respond(new URL(url).pathname, body)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { httpClient: Stripe.createFetchHttpClient(fetchFn as typeof fetch), requests };
}

describe('StripePaymentProvider', () => {
  it('refuses live keys unless STRIPE_ALLOW_LIVE is set (TEST MODE ONLY)', () => {
    expect(() => new StripePaymentProvider({ secretKey: 'sk_live_abc' })).toThrow(/live/i);
    expect(() => new StripePaymentProvider({ secretKey: 'rk_live_abc' })).toThrow(/live/i);
    expect(() => new StripePaymentProvider({ secretKey: 'sk_test_abc' })).not.toThrow();

    setEnv({ STRIPE_ALLOW_LIVE: 'true' });
    expect(() => new StripePaymentProvider({ secretKey: 'sk_live_abc' })).not.toThrow();
  });

  it('creates a EUR PaymentIntent with automatic payment methods, order metadata and an idempotency key', async () => {
    const http = fakeStripeHttp(() => ({ id: 'pi_123', object: 'payment_intent', client_secret: 'pi_123_secret_abc', status: 'requires_payment_method' }));
    const provider = new StripePaymentProvider({ secretKey: 'sk_test_abc', publishableKey: 'pk_test_abc', httpClient: http.httpClient });

    expect(await provider.createPayment(params)).toEqual({ paymentIntentId: 'pi_123', clientSecret: 'pi_123_secret_abc' });
    const [req] = http.requests;
    expect(req!.method).toBe('POST');
    expect(new URL(req!.url).pathname).toBe('/v1/payment_intents');
    expect(req!.headers.get('idempotency-key')).toBe(params.idempotencyKey);
    expect(req!.headers.get('authorization')).toBe('Bearer sk_test_abc');
    expect(Object.fromEntries(req!.body)).toMatchObject({
      amount: '1550',
      currency: 'eur',
      'automatic_payment_methods[enabled]': 'true',
      'metadata[orderId]': params.orderId,
      'metadata[orderNumber]': '1042',
      description: 'Ordine #1042',
    });
    expect(provider.id).toBe('stripe');
    expect(provider.publishableKey()).toBe('pk_test_abc');
  });

  it('retrieves, cancels and refunds through the API', async () => {
    const http = fakeStripeHttp((path) => {
      if (path.endsWith('/cancel')) return { id: 'pi_123', object: 'payment_intent', status: 'canceled' };
      if (path === '/v1/refunds') return { id: 're_1', object: 'refund' };
      return { id: 'pi_123', object: 'payment_intent', status: 'processing', client_secret: 'pi_123_secret_abc' };
    });
    const provider = new StripePaymentProvider({ secretKey: 'sk_test_abc', httpClient: http.httpClient });

    expect(await provider.retrievePayment('pi_123')).toEqual({ id: 'pi_123', status: 'processing', clientSecret: 'pi_123_secret_abc' });
    await provider.cancelPayment('pi_123');
    expect(await provider.refund('pi_123', 500)).toEqual({ id: 're_1' });

    expect(http.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'GET /v1/payment_intents/pi_123',
      'POST /v1/payment_intents/pi_123/cancel',
      'POST /v1/refunds',
    ]);
    expect(Object.fromEntries(http.requests[2]!.body)).toMatchObject({ payment_intent: 'pi_123', amount: '500' });
    expect(http.requests[2]!.headers.get('idempotency-key')).toBe('refund:pi_123:500');
    expect(provider.publishableKey()).toBeNull();
  });
});

describe('MockPaymentProvider', () => {
  it('refuses to exist when dev features are disabled', () => {
    setEnv({ DEV_FEATURES: 'false' });
    expect(() => new MockPaymentProvider()).toThrow(PaymentsUnavailableError);
  });

  it('is stateless and deterministic: the client secret can be recomputed from the id', async () => {
    const mock = new MockPaymentProvider();
    const a = await mock.createPayment(params);
    const b = await new MockPaymentProvider().createPayment(params);
    expect(a.paymentIntentId).toBe('pi_mock_6f1c2f0e8a544d3b9a432b1a2b9d7f10');
    expect(a).toEqual(b);
    expect(a.clientSecret).toMatch(new RegExp(`^${a.paymentIntentId}_secret_[A-Za-z0-9_-]{16,}$`));
    expect(await mock.retrievePayment(a.paymentIntentId)).toMatchObject({ id: a.paymentIntentId, clientSecret: a.clientSecret });
    await expect(mock.cancelPayment(a.paymentIntentId)).resolves.toBeUndefined();
    expect((await mock.refund(a.paymentIntentId)).id).toMatch(/^re_mock_/);
    expect(mock.publishableKey()).toBeNull();
    expect(mock.id).toBe('mock');
  });

  it('signs events that the real Stripe verifier accepts with the mock secret', () => {
    const event = { id: 'evt_mock_1', object: 'event', type: 'payment_intent.succeeded', data: { object: { id: 'pi_mock_1' } } };
    const { body, signature } = signMockEvent(event);
    expect(JSON.parse(body)).toEqual(event);
    expect(Stripe.webhooks.constructEvent(body, signature, 'whsec_mock_dev_only').id).toBe('evt_mock_1');
    expect(mockWebhookSecret()).toBe('whsec_mock_dev_only');

    setEnv({ MOCK_WEBHOOK_SECRET: 'whsec_custom' });
    const custom = signMockEvent(event);
    expect(() => Stripe.webhooks.constructEvent(custom.body, custom.signature, 'whsec_custom')).not.toThrow();
  });
});

describe('getPaymentProvider', () => {
  it('uses Stripe when a secret key is configured', () => {
    setEnv({ STRIPE_SECRET_KEY: 'sk_test_x', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
    const provider = getPaymentProvider();
    expect(provider.id).toBe('stripe');
    expect(provider.publishableKey()).toBe('pk_test_x');
  });

  it('falls back to the mock only when dev features are on', () => {
    expect(getPaymentProvider().id).toBe('mock');
    setEnv({ DEV_FEATURES: 'false' });
    expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
  });

  it('honours PAYMENTS_PROVIDER explicitly', () => {
    setEnv({ PAYMENTS_PROVIDER: 'mock', STRIPE_SECRET_KEY: 'sk_test_x' });
    expect(getPaymentProvider().id).toBe('mock');
    setEnv({ PAYMENTS_PROVIDER: 'stripe' });
    expect(getPaymentProvider().id).toBe('stripe');
  });

  it('refuses stripe without a key, mock in production, and live keys', () => {
    setEnv({ PAYMENTS_PROVIDER: 'stripe' });
    expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
    setEnv({ PAYMENTS_PROVIDER: 'mock', VERCEL_ENV: 'production' });
    expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
    setEnv({ PAYMENTS_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_x', VERCEL_ENV: 'preview' });
    expect(() => getPaymentProvider()).toThrow(/live/i);
  });
});
