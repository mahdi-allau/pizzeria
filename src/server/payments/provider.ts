import { devFeaturesEnabled, getEnv } from '@/env';
import { MockPaymentProvider } from './mock';
import { StripePaymentProvider } from './stripe';
import { type PaymentProvider, PaymentsUnavailableError } from './types';

/**
 * Picks the payment provider from the environment:
 *  1. PAYMENTS_PROVIDER=stripe|mock when set;
 *  2. otherwise Stripe when STRIPE_SECRET_KEY is set;
 *  3. otherwise the mock, but only while dev features are enabled.
 * @throws PaymentsUnavailableError when nothing usable is configured; Error for a refused live key.
 */
export function getPaymentProvider(): PaymentProvider {
  const env = getEnv();
  const choice = env.PAYMENTS_PROVIDER ?? (env.STRIPE_SECRET_KEY ? 'stripe' : devFeaturesEnabled() ? 'mock' : null);

  if (choice === 'stripe') {
    if (!env.STRIPE_SECRET_KEY) throw new PaymentsUnavailableError('STRIPE_SECRET_KEY is not set');
    return new StripePaymentProvider({ secretKey: env.STRIPE_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null });
  }
  if (choice === 'mock') return new MockPaymentProvider();
  throw new PaymentsUnavailableError('No payment provider configured: set STRIPE_SECRET_KEY (test mode)');
}
