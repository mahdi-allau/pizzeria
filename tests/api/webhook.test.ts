import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbHandle } from '@/db/client';
import { orders, paymentEvents } from '@/db/schema';
import { createPendingOrder } from '@/server/orders';
import { handleMockPay, handleWebhookRequest, signMockEvent, webhookSecrets } from '@/server/payments';
import { createTestDb } from '../helpers/db';
import { COCA_COLA, MARGHERITA_MEDIA, T0, checkoutInput } from '../server/orders/_fixtures';
import { scopedEnv } from '../server/payments/_env';
import { paymentIntentEvent } from '../server/payments/_events';
import { afterCollector, jsonRequest, readJson } from './_http';

const SECRET = 'whsec_test_real_signature_maths';
const TOTAL = MARGHERITA_MEDIA * 2 + COCA_COLA;
const setEnv = scopedEnv();

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb({ seed: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.delete(orders);
  await handle.db.delete(paymentEvents);
});

async function order(provider: 'stripe' | 'mock' = 'stripe') {
  const { order: o } = await createPendingOrder(handle.db, checkoutInput(), { now: T0, provider });
  const piId = `pi_${o.number}`;
  await handle.db.update(orders).set({ paymentIntentId: piId }).where(eq(orders.id, o.id));
  return { ...o, piId };
}

function signed(event: object, options: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: options.secret ?? SECRET, ...(options.timestamp ? { timestamp: options.timestamp } : {}) });
  return { body, signature };
}

function webhookRequest(body: string, signature?: string) {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
    body,
  });
}

function setup() {
  const after = afterCollector();
  const notify = vi.fn<(db: unknown, orderId: string) => Promise<void>>(async () => {});
  /** Secrets resolved from the environment (webhookSecrets()). */
  const envDeps = { db: handle.db, now: T0, scheduleAfter: after.scheduleAfter, notify };
  return { after, notify, envDeps, deps: { ...envDeps, secrets: [SECRET] } };
}

describe('POST /api/stripe/webhook', () => {
  it('verifies the signature, marks the order paid and schedules the notification after the response', async () => {
    const o = await order();
    const { after, notify, deps } = setup();
    const { body, signature } = signed(paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL }));

    const res = await handleWebhookRequest(webhookRequest(body, signature), deps);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ received: true, outcome: 'paid' });
    expect((await handle.db.select().from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe('new');

    expect(notify).not.toHaveBeenCalled(); // only after the response
    expect(after.tasks).toHaveLength(1);
    await after.runAll();
    expect(notify).toHaveBeenCalledWith(handle.db, o.id);
  });

  it('re-schedules the (idempotent) notification on a duplicate delivery', async () => {
    const o = await order();
    const { after, notify, deps } = setup();
    const { body, signature } = signed(paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL }));
    await handleWebhookRequest(webhookRequest(body, signature), deps);
    const res = await handleWebhookRequest(webhookRequest(body, signature), deps);
    expect(await readJson(res)).toEqual({ received: true, outcome: 'duplicate' });
    await after.runAll();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('rejects a tampered body with 400 and changes nothing', async () => {
    const o = await order();
    const { deps, after } = setup();
    const { body, signature } = signed(paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: 1 }));
    const tampered = body.replace('"amount_received":1', `"amount_received":${TOTAL}`);
    expect(tampered).not.toBe(body);
    const res = await handleWebhookRequest(webhookRequest(tampered, signature), deps);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('INVALID_SIGNATURE');
    expect(await handle.db.select().from(paymentEvents)).toHaveLength(0);
    expect(after.tasks).toHaveLength(0);
  });

  it('rejects a wrong secret, a missing header and a replayed old timestamp', async () => {
    const o = await order();
    const { deps } = setup();
    const event = paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL });

    const wrong = signed(event, { secret: 'whsec_attacker' });
    expect((await handleWebhookRequest(webhookRequest(wrong.body, wrong.signature), deps)).status).toBe(400);

    expect((await handleWebhookRequest(webhookRequest(JSON.stringify(event)), deps)).status).toBe(400);

    const replay = signed(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await handleWebhookRequest(webhookRequest(replay.body, replay.signature), deps)).status).toBe(400);

    expect((await handle.db.select().from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe('awaiting_payment');
  });

  it('handles out-of-order, unknown-order and amount-mismatch events with 200 and no notification', async () => {
    const o = await order();
    const { after, deps } = setup();
    const send = async (event: object) => readJson(await handleWebhookRequest(webhookRequest(signed(event).body, signed(event).signature), deps));

    expect((await send(paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL + 1 }))).outcome).toBe('amount_mismatch');
    expect((await send(paymentIntentEvent('payment_intent.succeeded', { piId: 'pi_ghost', orderId: null, amount: TOTAL }))).outcome).toBe('unknown_order');
    expect(after.tasks).toHaveLength(0);

    expect((await send(paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL }))).outcome).toBe('paid');
    expect((await send(paymentIntentEvent('payment_intent.payment_failed', { piId: o.piId, orderId: o.id }))).outcome).toBe('failed_ignored');
    expect((await handle.db.select().from(orders).where(eq(orders.id, o.id)))[0]!.paymentStatus).toBe('paid');
  });

  it('accepts mock-signed events only while dev features are on', async () => {
    const o = await order();
    const { envDeps } = setup();
    const event = paymentIntentEvent('payment_intent.succeeded', { piId: o.piId, orderId: o.id, amount: TOTAL, id: 'evt_mock_1' });
    const mock = signMockEvent(event);

    setEnv({ STRIPE_WEBHOOK_SECRET: SECRET, DEV_FEATURES: 'false' });
    expect(webhookSecrets()).toEqual([SECRET]);
    expect((await handleWebhookRequest(webhookRequest(mock.body, mock.signature), envDeps)).status).toBe(400);

    setEnv({ DEV_FEATURES: 'true' });
    expect(webhookSecrets()).toEqual([SECRET, 'whsec_mock_dev_only']);
    expect((await handleWebhookRequest(webhookRequest(mock.body, mock.signature), envDeps)).status).toBe(200);
  });

  it('answers 500 when no webhook secret is configured', async () => {
    setEnv({ DEV_FEATURES: 'false' });
    const { envDeps } = setup();
    const res = await handleWebhookRequest(webhookRequest('{}', 't=1,v1=x'), envDeps);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/dev/mock-pay', () => {
  it('simulates a successful payment through the real webhook path', async () => {
    const o = await order('mock');
    const { after, notify, envDeps } = setup();
    const res = await handleMockPay(jsonRequest('/api/dev/mock-pay', { orderToken: o.publicToken, outcome: 'succeeded' }), envDeps);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ received: true, outcome: 'paid' });
    const [recorded] = await handle.db.select().from(paymentEvents);
    expect(recorded!.id).toMatch(/^evt_mock_/);
    expect(recorded!.provider).toBe('mock');
    await after.runAll();
    expect(notify).toHaveBeenCalledWith(handle.db, o.id);
  });

  it('simulates a declined card', async () => {
    const o = await order('mock');
    const { envDeps } = setup();
    const res = await handleMockPay(jsonRequest('/api/dev/mock-pay', { orderToken: o.publicToken, outcome: 'failed' }), envDeps);
    expect(await readJson(res)).toEqual({ received: true, outcome: 'failed_recorded' });
    expect((await handle.db.select().from(orders).where(eq(orders.id, o.id)))[0]!.paymentStatus).toBe('failed');
  });

  it('is a 404 when dev features are off, for unknown tokens and bad input; 409 for Stripe orders', async () => {
    const stripeOrder = await order('stripe');
    const { envDeps } = setup();
    const call = (body: unknown) => handleMockPay(jsonRequest('/api/dev/mock-pay', body), envDeps);

    expect((await call({ orderToken: 'A'.repeat(24), outcome: 'succeeded' })).status).toBe(404);
    expect((await call({ orderToken: stripeOrder.publicToken, outcome: 'maybe' })).status).toBe(400);
    expect((await call({ orderToken: stripeOrder.publicToken, outcome: 'succeeded' })).status).toBe(409);

    setEnv({ DEV_FEATURES: 'false' });
    const mockOrder = await order('mock');
    expect((await call({ orderToken: mockOrder.publicToken, outcome: 'succeeded' })).status).toBe(404);
  });
});
