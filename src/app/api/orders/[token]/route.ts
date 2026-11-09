import { connection } from 'next/server';
import { withDb } from '@/server/orders/http';
import { handleOrderStatus } from '@/server/orders/public-http';

/** Public order status by unguessable token. Contract: src/server/orders/public-http.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  await connection();
  const { token } = await params;
  return withDb((db) => handleOrderStatus(request, token, { db }));
}
