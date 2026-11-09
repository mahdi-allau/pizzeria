import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orders, products, settings } from '@/db/schema';
import { handleCheckout } from '@/server/orders/checkout-http';
import { MockPaymentProvider, PaymentsUnavailableError } from '@/server/payments';
import { createTestDb } from '../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, T0, checkoutBody, recordingProvider, setCapacity } from '../server/orders/_fixtures';
import { jsonRequest, readJson, uniqueIp } from './_http';

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(orders);
  await setCapacity(handle.db, 8);
});

const TOTAL = MARGHERITA_MEDIA * 2 + COCA_COLA;

function deps(provider = recordingProvider().provider) {
  return { db: handle.db, now: T0, getProvider: () => provider };
}
const post = (body: unknown, ip?: string) => jsonRequest('/api/checkout', body, { ip });

describe('POST /api/checkout', () => {
  it('creates the order and the PaymentIntent and returns what the Payment Element needs', async () => {
    const { provider, calls } = recordingProvider();
    const res = await handleCheckout(post(checkoutBody()), deps(provider));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await readJson(res);
    expect(body).toEqual({
      orderToken: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
      orderNumber: expect.any(Number),
      totalCents: TOTAL,
      provider: 'stripe',
      paymentIntentId: 'pi_rec_1',
      clientSecret: 'pi_rec_1_secret_x',
      publishableKey: 'pk_test_rec',
    });

    const [order] = await handle.db.select().from(orders);
    expect(order!.paymentIntentId).toBe('pi_rec_1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0]).toMatchObject({
      orderId: order!.id,
      orderNumber: order!.number,
      amountCents: TOTAL,
      currency: 'eur',
      customerEmail: 'mario.rossi@example.it',
      idempotencyKey: `order:${order!.id}`,
      description: expect.stringContaining(`#${order!.number}`),
    });
  });

  it('returns the same PaymentIntent for a retried request (no second order, no second intent)', async () => {
    const { provider, calls } = recordingProvider();
    const body = checkoutBody();
    const first = await readJson(await handleCheckout(post(body), deps(provider)));
    const again = await handleCheckout(post(body), deps(provider));
    expect(again.status).toBe(200);
    const second = await readJson(again);
    expect(second).toMatchObject({ orderToken: first.orderToken, paymentIntentId: first.paymentIntentId, clientSecret: 'pi_rec_1_secret_x' });
    expect(calls.map((c) => c.method)).toEqual(['createPayment', 'retrievePayment']);
    expect(await handle.db.select().from(orders)).toHaveLength(1);
  });

  it('retries PaymentIntent creation when the first attempt failed after the order was stored', async () => {
    const { provider, calls } = recordingProvider();
    const flaky = { ...provider, createPayment: async () => Promise.reject(new Error('stripe timeout')) };
    const body = checkoutBody();
    const failed = await handleCheckout(post(body), deps(flaky));
    expect(failed.status).toBe(503);
    expect((await readJson(failed)).error.code).toBe('PAYMENTS_UNAVAILABLE');

    const ok = await handleCheckout(post(body), deps(provider));
    expect(ok.status).toBe(200);
    expect((await readJson(ok)).paymentIntentId).toBe('pi_rec_1');
    expect(calls.map((c) => c.method)).toEqual(['createPayment']);
  });

  it('works end-to-end with the dev mock provider', async () => {
    const res = await handleCheckout(post(checkoutBody()), deps(new MockPaymentProvider()));
    const body = await readJson(res);
    expect(body).toMatchObject({ provider: 'mock', publishableKey: null, paymentIntentId: expect.stringMatching(/^pi_mock_/) });
  });

  describe('errors', () => {
    it('400 INVALID_INPUT with a field map for invalid data', async () => {
      const res = await handleCheckout(post(checkoutBody({ customer: { name: 'Mario', phone: '333 1234567', email: 'nope' } })), deps());
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.error).toMatchObject({ code: 'INVALID_INPUT', fields: { 'customer.email': 'Inserisci un indirizzo email valido.' } });
      expect(typeof body.error.message).toBe('string');
    });

    it('400 INVALID_INPUT for malformed JSON, without leaking internals', async () => {
      const res = await handleCheckout(post('{"cart": ['), deps());
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.error.code).toBe('INVALID_INPUT');
      expect(JSON.stringify(body)).not.toMatch(/SyntaxError|at JSON|stack/);
    });

    it('409 PRICE_MISMATCH with the server-priced cart', async () => {
      const res = await handleCheckout(post(checkoutBody({ expectedTotalCents: 1 })), deps());
      expect(res.status).toBe(409);
      const { error } = await readJson(res);
      expect(error).toMatchObject({
        code: 'PRICE_MISMATCH',
        expectedTotalCents: 1,
        computedTotalCents: TOTAL,
        cart: { totalCents: TOTAL, lines: [{ name: 'Margherita', quantity: 2, unitPriceCents: MARGHERITA_MEDIA, lineTotalCents: MARGHERITA_MEDIA * 2 }, expect.any(Object)] },
      });
    });

    it('409 SLOT_UNAVAILABLE with the reason', async () => {
      await setCapacity(handle.db, 1);
      const res = await handleCheckout(post(checkoutBody()), deps());
      expect(res.status).toBe(409);
      expect((await readJson(res)).error).toMatchObject({ code: 'SLOT_UNAVAILABLE', reason: 'too_many_pizzas' });
    });

    it('409 ITEM_UNAVAILABLE with the slug', async () => {
      await handle.db.update(products).set({ available: false }).where(eq(products.slug, 'coca-cola-33'));
      try {
        const res = await handleCheckout(post(checkoutBody()), deps());
        expect(res.status).toBe(409);
        expect((await readJson(res)).error).toMatchObject({ code: 'ITEM_UNAVAILABLE', slug: 'coca-cola-33' });
      } finally {
        await handle.db.update(products).set({ available: true }).where(eq(products.slug, 'coca-cola-33'));
      }
    });

    it('409 IDEMPOTENCY_CONFLICT when a request id is reused with other data', async () => {
      const body = checkoutBody();
      await handleCheckout(post(body), deps());
      const res = await handleCheckout(post({ ...body, customer: { name: 'Altro', phone: '3331234567', email: 'altro@example.it' } }), deps());
      expect(res.status).toBe(409);
      expect((await readJson(res)).error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('423 SHOP_CLOSED with the closed message', async () => {
      await handle.db.update(settings).set({ shopOpen: false, closedMessage: 'Torniamo lunedì' }).where(eq(settings.id, 1));
      try {
        const res = await handleCheckout(post(checkoutBody()), deps());
        expect(res.status).toBe(423);
        expect((await readJson(res)).error).toMatchObject({ code: 'SHOP_CLOSED', message: 'Torniamo lunedì', closedMessage: 'Torniamo lunedì' });
      } finally {
        await handle.db.update(settings).set({ shopOpen: true, closedMessage: null }).where(eq(settings.id, 1));
      }
    });

    it('503 PAYMENTS_UNAVAILABLE when no provider is configured (and no order is created)', async () => {
      const res = await handleCheckout(post(checkoutBody()), {
        db: handle.db,
        now: T0,
        getProvider: () => {
          throw new PaymentsUnavailableError();
        },
      });
      expect(res.status).toBe(503);
      expect((await readJson(res)).error.code).toBe('PAYMENTS_UNAVAILABLE');
      expect(await handle.db.select().from(orders)).toHaveLength(0);
    });

    it('429 RATE_LIMITED after 10 attempts in 10 minutes from one address', async () => {
      const ip = uniqueIp();
      for (let i = 0; i < 10; i++) expect((await handleCheckout(post('{', ip), deps())).status).toBe(400);
      const res = await handleCheckout(post(checkoutBody(), ip), deps());
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
      expect((await readJson(res)).error.code).toBe('RATE_LIMITED');
    });

    it('500 with a generic Italian message on unexpected failures', async () => {
      const res = await handleCheckout(post(checkoutBody()), {
        db: handle.db,
        now: T0,
        getProvider: () => {
          throw new TypeError('boom secret detail');
        },
      });
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body.error.code).toBe('INTERNAL');
      expect(JSON.stringify(body)).not.toContain('boom');
    });
  });
});
