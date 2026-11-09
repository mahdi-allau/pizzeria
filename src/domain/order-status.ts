/**
 * Order lifecycle. Pure: no I/O.
 *
 *   awaiting_payment ──(verified payment, system)──▶ new ▶ preparing ▶ ready ▶ completed
 *
 * `awaiting_payment` can only become `new` through the payment webhook (actor "system"), never by hand.
 * The kitchen (actor "admin") drives new → preparing → ready → completed (Nuovo → In preparazione → Pronto → Ritirato),
 * may step back one stage to fix a mis-tap, and may cancel until the order is collected.
 */
export const ORDER_STATUSES = ['awaiting_payment', 'new', 'preparing', 'ready', 'completed', 'cancelled', 'expired'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Actor = 'system' | 'admin' | 'customer';

/** The kitchen's forward path, in order. */
export const STATUS_FLOW = ['new', 'preparing', 'ready', 'completed'] as const satisfies readonly OrderStatus[];

type Table = Partial<Record<OrderStatus, readonly OrderStatus[]>>;

const ALLOWED: Record<Actor, Table> = {
  system: {
    awaiting_payment: ['new', 'expired', 'cancelled'],
  },
  admin: {
    awaiting_payment: ['cancelled'],
    new: ['preparing', 'cancelled'],
    preparing: ['ready', 'new', 'cancelled'],
    ready: ['completed', 'preparing', 'cancelled'],
    completed: ['ready'],
  },
  customer: {},
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: Actor,
  ) {
    super(`${actor} cannot move an order from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return ALLOWED[actor][from]?.includes(to) ?? false;
}

export function transition(from: OrderStatus, to: OrderStatus, actor: Actor): OrderStatus {
  if (!canTransition(from, to, actor)) throw new InvalidTransitionError(from, to, actor);
  return to;
}

const flowIndex = (status: OrderStatus) => (STATUS_FLOW as readonly OrderStatus[]).indexOf(status);

export function nextAdminStatus(status: OrderStatus): OrderStatus | null {
  const i = flowIndex(status);
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1]! : null;
}

export function previousAdminStatus(status: OrderStatus): OrderStatus | null {
  const i = flowIndex(status);
  return i > 0 ? STATUS_FLOW[i - 1]! : null;
}

/** No further kitchen work is expected. */
export function isTerminal(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'expired';
}

/** Paid and still in the kitchen's hands (shown on the live board). */
export function isActive(status: OrderStatus): boolean {
  return status === 'new' || status === 'preparing' || status === 'ready';
}

/** Statuses an order can only reach after a verified payment. */
export function isPaidStatus(status: OrderStatus): boolean {
  return status === 'new' || status === 'preparing' || status === 'ready' || status === 'completed';
}
