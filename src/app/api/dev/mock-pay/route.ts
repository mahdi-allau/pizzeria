import { after } from 'next/server';
import { withDb } from '@/server/orders/http';
import { handleMockPay } from '@/server/payments';

/** DEV ONLY (404 otherwise): simulates a payment outcome through the real webhook path. */
export async function POST(request: Request): Promise<Response> {
  return withDb((db) =>
    handleMockPay(request, {
      db,
      scheduleAfter: (task) =>
        after(async () => {
          await task();
        }),
    }),
  );
}
