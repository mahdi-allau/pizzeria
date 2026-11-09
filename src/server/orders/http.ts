import 'server-only';
import { type Db, getDb } from '@/db/client';
import { clientIp, rateLimit } from '@/server/rate-limit';

/**
 * Shared bits of the JSON route handlers. Every response is `Cache-Control: no-store`; every error body is
 * `{ error: { code, message (Italian), …extra } }` and never contains a stack trace.
 */

export const NO_STORE = { 'cache-control': 'no-store' } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorJson(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message, ...extra } }, status, headers);
}

export const internalError = () => errorJson(500, 'INTERNAL', 'Si è verificato un errore imprevisto. Riprova tra poco.');

/** Applies a per-IP fixed-window limit; returns the 429 response to send, or null when the request may proceed. */
export async function enforceRateLimit(
  db: Db,
  request: Request,
  { name, limit, windowSeconds, now }: { name: string; limit: number; windowSeconds: number; now?: Date },
): Promise<Response | null> {
  const result = await rateLimit(db, { key: `${name}:${clientIp(request.headers)}`, limit, windowSeconds, now });
  if (result.allowed) return null;
  return errorJson(
    429,
    'RATE_LIMITED',
    'Troppe richieste. Attendi qualche istante e riprova.',
    {},
    { 'retry-after': String(result.retryAfterSeconds) },
  );
}

/**
 * For route files: runs `handler` with the process-wide database, turning a connection/bootstrap failure into the
 * standard JSON 500 instead of an HTML error page.
 */
export async function withDb(handler: (db: Db) => Promise<Response>): Promise<Response> {
  let db: Db;
  try {
    db = await getDb();
  } catch (error) {
    console.error('[api] database unavailable', error);
    return internalError();
  }
  return handler(db);
}

/** Reads a JSON body (max `maxBytes`); returns undefined when it is missing, too large or not valid JSON. */
export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
