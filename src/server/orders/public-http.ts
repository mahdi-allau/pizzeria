import { business } from '@/config/business';
import type { Db } from '@/db/client';
import { buildSlots } from '@/domain/slots';
import { loadSettings, toSlotRules } from '@/server/settings';
import { loadSlotLoad } from './create';
import { enforceRateLimit, errorJson, internalError, json } from './http';
import { getOrderByToken } from './queries';

export interface PublicDeps {
  db: Db;
  now?: Date;
}

export const SLOTS_RATE_LIMIT = { limit: 60, windowSeconds: 60 } as const;
export const ORDER_STATUS_RATE_LIMIT = { limit: 120, windowSeconds: 60 } as const;

/** Public order tokens are 24 url-safe chars today; accept 20–32 so the format can evolve. */
export const ORDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,32}$/;

/**
 * GET /api/slots?pizzas=<0..50>
 * 200 { now, timezone, shop: { open, closedMessage }, days: DaySlots[] } · 400 INVALID_INPUT · 429 RATE_LIMITED
 */
export async function handleSlots(request: Request, deps: PublicDeps): Promise<Response> {
  const now = deps.now ?? new Date();
  try {
    const limited = await enforceRateLimit(deps.db, request, { name: 'slots', ...SLOTS_RATE_LIMIT, now });
    if (limited) return limited;

    const raw = new URL(request.url).searchParams.get('pizzas') ?? '0';
    const pizzas = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (!(pizzas >= 0 && pizzas <= 50)) {
      return errorJson(400, 'INVALID_INPUT', 'Numero di pizze non valido.', { fields: { pizzas: 'Indica un numero di pizze tra 0 e 50.' } });
    }

    const settings = await loadSettings(deps.db);
    const rules = toSlotRules(settings);
    const load = await loadSlotLoad(deps.db, now, rules);
    const open = settings.shopOpen || (settings.reopenAt !== null && settings.reopenAt <= now);
    return json({
      now: now.toISOString(),
      timezone: business.timezone,
      shop: { open, closedMessage: open ? null : settings.closedMessage },
      days: buildSlots({ now, rules, load, pizzaCount: pizzas }),
    });
  } catch (error) {
    console.error('[slots] unexpected error', error);
    return internalError();
  }
}

const notFound = () => errorJson(404, 'NOT_FOUND', 'Ordine non trovato.');

/**
 * GET /api/orders/[token] — public status page data (no email / phone).
 * 200 PublicOrderStatus · 404 NOT_FOUND (same body for malformed and unknown tokens) · 429 RATE_LIMITED
 */
export async function handleOrderStatus(request: Request, token: string, deps: PublicDeps): Promise<Response> {
  const now = deps.now ?? new Date();
  try {
    const limited = await enforceRateLimit(deps.db, request, { name: 'order-status', ...ORDER_STATUS_RATE_LIMIT, now });
    if (limited) return limited;
    if (!ORDER_TOKEN_PATTERN.test(token)) return notFound();
    const status = await getOrderByToken(deps.db, token);
    return status ? json(status) : notFound();
  } catch (error) {
    console.error('[order-status] unexpected error', error);
    return internalError();
  }
}
