import { after } from 'next/server';
import { withDb } from '@/server/orders/http';
import { handleWebhookRequest } from '@/server/payments';

export const maxDuration = 30;

/** Stripe webhook: signature-verified, idempotent. Logic: src/server/payments/webhook-http.ts. */
export async function POST(request: Request): Promise<Response> {
  return withDb((db) =>
    handleWebhookRequest(request, {
      db,
      scheduleAfter: (task) =>
        after(async () => {
          await task();
        }),
    }),
  );
}
