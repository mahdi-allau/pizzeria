import { connection } from 'next/server';
import { handleHousekeeping } from '@/server/orders/housekeeping';
import { withDb } from '@/server/orders/http';
import { getPaymentProvider } from '@/server/payments';

export const maxDuration = 60;

/** Vercel Cron (Authorization: Bearer CRON_SECRET). Logic: src/server/orders/housekeeping.ts. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return withDb((db) => handleHousekeeping(request, { db, getProvider: getPaymentProvider }));
}
