/**
 * Order state machine (spec 8.1). Pure: no I/O, never mutates its input.
 *
 * `SENT_TO_POS` and `PRINT_CONFIRMED` are two independent tracks recorded as
 * markers (`posConfirmedAt`, `printConfirmedAt`). Either may come first after
 * ACCEPTED; `READY` requires both markers.
 */
export type OrderStatus =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'ACCEPTED'
  | 'SENT_TO_POS'
  | 'PRINT_CONFIRMED'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NEEDS_ATTENTION';

export interface OrderState {
  status: OrderStatus;
  posConfirmedAt?: Date;
  printConfirmedAt?: Date;
  /** Set only while status is NEEDS_ATTENTION. */
  previousStatus?: OrderStatus;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    reason?: string,
  ) {
    super(`Invalid order transition ${from} -> ${to}${reason ? `: ${reason}` : ''}`);
    this.name = 'InvalidTransitionError';
  }
}

const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);

/**
 * Explicit allowed targets per status. Generic escapes (NEEDS_ATTENTION,
 * CANCELLED) are listed on every non-final status except NEEDS_ATTENTION itself,
 * which may only return to its stored previous status (handled separately).
 */
const ALLOWED: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  RECEIVED: ['VALIDATED', 'REJECTED', 'NEEDS_ATTENTION', 'CANCELLED'],
  VALIDATED: ['ACCEPTED', 'NEEDS_ATTENTION', 'CANCELLED'],
  ACCEPTED: ['SENT_TO_POS', 'PRINT_CONFIRMED', 'NEEDS_ATTENTION', 'CANCELLED'],
  SENT_TO_POS: ['PRINT_CONFIRMED', 'READY', 'NEEDS_ATTENTION', 'CANCELLED'],
  PRINT_CONFIRMED: ['SENT_TO_POS', 'READY', 'NEEDS_ATTENTION', 'CANCELLED'],
  READY: ['COMPLETED', 'NEEDS_ATTENTION', 'CANCELLED'],
  NEEDS_ATTENTION: [],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function transition(state: OrderState, to: OrderStatus, at: Date): OrderState {
  const from = state.status;

  if (FINAL_STATUSES.has(from)) {
    throw new InvalidTransitionError(from, to, `${from} is final`);
  }

  if (from === 'NEEDS_ATTENTION') {
    if (state.previousStatus === undefined || to !== state.previousStatus) {
      throw new InvalidTransitionError(
        from,
        to,
        `may only return to previous status ${String(state.previousStatus)}`,
      );
    }
    const { previousStatus: _resolved, ...rest } = state;
    return { ...rest, status: to };
  }

  if (!ALLOWED[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }

  switch (to) {
    case 'NEEDS_ATTENTION':
      return { ...state, status: to, previousStatus: from };
    case 'SENT_TO_POS':
      if (state.posConfirmedAt !== undefined) {
        throw new InvalidTransitionError(from, to, 'POS confirmation already recorded');
      }
      return { ...state, status: to, posConfirmedAt: new Date(at) };
    case 'PRINT_CONFIRMED':
      if (state.printConfirmedAt !== undefined) {
        throw new InvalidTransitionError(from, to, 'print confirmation already recorded');
      }
      return { ...state, status: to, printConfirmedAt: new Date(at) };
    case 'READY':
      if (state.posConfirmedAt === undefined || state.printConfirmedAt === undefined) {
        throw new InvalidTransitionError(
          from,
          to,
          'READY requires both POS and print confirmation',
        );
      }
      return { ...state, status: to };
    default:
      return { ...state, status: to };
  }
}
