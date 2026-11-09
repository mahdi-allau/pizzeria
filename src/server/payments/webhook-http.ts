import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { orders } from '@/db/schema';
import { devFeaturesEnabled, getEnv } from '@/env';
import { notifyOrderPaid } from '@/server/email/notify';
import { errorJson, internalError, json, readJsonBody } from '@/server/orders/http';
import { ORDER_TOKEN_PATTERN } from '@/server/orders/public-http';
import { mockWebhookSecret, signMockEvent } from './mock';
import { type StripeEventLike, processStripeEvent } from './webhook';

export interface WebhookDeps {
  db: Db;
  now?: Date;
  /** Runs work after the response is sent (`after` from next/server in production). */
  scheduleAfter: (task: () => unknown) => void;
  /** Override the secrets tried, in order (default: webhookSecrets()). */
  secrets?: string[];
  /** Override the paid-order notification (default notifyOrderPaid from @/server/email/notify). */
  notify?: (db: Db, orderId: string) => Promise<void>;
}

/** STRIPE_WEBHOOK_SECRET, plus the dev mock secret while dev features are enabled. */
export function webhookSecrets(): string[] {
  const env = getEnv();
  const secrets: string[] = [];
  if (env.STRIPE_WEBHOOK_SECRET) secrets.push(env.STRIPE_WEBHOOK_SECRET);
  if (devFeaturesEnabled()) secrets.push(mockWebhookSecret());
  return secrets;
}

const invalidSignature = () => errorJson(400, 'INVALID_SIGNATURE', 'Firma del webhook non valida.');

function verify(body: string, signature: string, secrets: string[]): StripeEventLike | null {
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(body, signature, secret) as StripeEventLike;
    } catch {
      // try the next secret
    }
  }
  return null;
}

/**
 * POST /api/stripe/webhook. Verifies `stripe-signature` against the RAW body (default tolerance: 5 minutes, which
 * also rejects replays), applies the event exactly once, and schedules the paid-order notification after the response.
 * 200 { received: true, outcome } · 400 INVALID_SIGNATURE · 500 (not configured / DB failure → Stripe retries)
 */
export async function handleWebhookRequest(request: Request, deps: WebhookDeps): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return invalidSignature();
  const body = await request.text();

  const secrets = deps.secrets ?? webhookSecrets();
  if (secrets.length === 0) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set');
    return errorJson(500, 'WEBHOOK_NOT_CONFIGURED', 'Webhook non configurato.');
  }
  const event = verify(body, signature, secrets);
  if (!event) return invalidSignature();

  try {
    const result = await processStripeEvent(deps.db, event, { now: deps.now });
    if (result.orderPaid && result.orderId) {
      const orderId = result.orderId;
      const notify = deps.notify ?? notifyOrderPaid;
      deps.scheduleAfter(() =>
        notify(deps.db, orderId).catch((error: unknown) => console.error('[webhook] notifyOrderPaid failed', { orderId, error })),
      );
    }
    if (result.outcome === 'amount_mismatch' || result.outcome === 'unknown_order' || result.outcome === 'paid_after_cancel') {
      console.warn('[webhook] anomaly', { eventId: event.id, type: event.type, ...result });
    }
    return json({ received: true, outcome: result.outcome });
  } catch (error) {
    console.error('[webhook] processing failed', { eventId: event.id, type: event.type, error });
    return internalError();
  }
}

const mockPaySchema = z.object({
  orderToken: z.string().regex(ORDER_TOKEN_PATTERN),
  outcome: z.enum(['succeeded', 'failed']),
});

/**
 * POST /api/dev/mock-pay { orderToken, outcome: 'succeeded' | 'failed' } — DEV ONLY (404 otherwise).
 * Builds a Stripe-shaped PaymentIntent event, signs it with the mock secret and runs it through the SAME
 * `handleWebhookRequest` as real Stripe deliveries. Returns the webhook's answer: { received: true, outcome }.
 */
export async function handleMockPay(request: Request, deps: Omit<WebhookDeps, 'secrets'>): Promise<Response> {
  const notFound = () => errorJson(404, 'NOT_FOUND', 'Non trovato.');
  if (!devFeaturesEnabled()) return notFound();

  const parsed = mockPaySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return errorJson(400, 'INVALID_INPUT', 'Richiesta non valida.');

  const [order] = await deps.db.select().from(orders).where(eq(orders.publicToken, parsed.data.orderToken));
  if (!order) return notFound();
  if (order.paymentProvider !== 'mock') {
    return errorJson(409, 'NOT_MOCK_ORDER', 'Questo ordine usa Stripe: paga con il modulo di pagamento.');
  }

  const succeeded = parsed.data.outcome === 'succeeded';
  const paymentIntentId = order.paymentIntentId ?? `pi_mock_${order.id.replace(/-/g, '')}`;
  const event = {
    id: `evt_mock_${randomBytes(12).toString('hex')}`,
    object: 'event',
    type: succeeded ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: order.totalCents,
        amount_received: succeeded ? order.totalCents : 0,
        currency: order.currency,
        status: succeeded ? 'succeeded' : 'requires_payment_method',
        metadata: { orderId: order.id, orderNumber: String(order.number) },
        ...(succeeded ? {} : { last_payment_error: { code: 'card_declined', message: 'Carta rifiutata (simulazione).' } }),
      },
    },
  };

  const { body, signature } = signMockEvent(event);
  const synthetic = new Request(new URL('/api/stripe/webhook', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body,
  });
  return handleWebhookRequest(synthetic, deps);
}
