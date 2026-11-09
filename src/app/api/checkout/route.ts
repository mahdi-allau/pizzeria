import { handleCheckout } from '@/server/orders/checkout-http';
import { withDb } from '@/server/orders/http';
import { getPaymentProvider } from '@/server/payments';

/** Creates the pending order + PaymentIntent. Contract: src/server/orders/checkout-http.ts. */
export async function POST(request: Request): Promise<Response> {
  return withDb((db) => handleCheckout(request, { db, getProvider: getPaymentProvider }));
}
