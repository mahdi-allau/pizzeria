import { connection } from 'next/server';
import { withDb } from '@/server/orders/http';
import { handleSlots } from '@/server/orders/public-http';

/** Pickup slots with live capacity. Contract: src/server/orders/public-http.ts. */
export async function GET(request: Request): Promise<Response> {
  await connection(); // always request-time: depends on the clock and live bookings
  return withDb((db) => handleSlots(request, { db }));
}
