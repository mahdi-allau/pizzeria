import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type OrderStatus,
  InvalidTransitionError,
  STATUS_FLOW,
  canTransition,
  isActive,
  isPaidStatus,
  isTerminal,
  nextAdminStatus,
  previousAdminStatus,
  transition,
} from '@/domain/order-status';

const ALL: OrderStatus[] = ['awaiting_payment', 'new', 'preparing', 'ready', 'completed', 'cancelled', 'expired'];

describe('allowed transitions', () => {
  const allowed: Array<[Actor, OrderStatus, OrderStatus]> = [
    ['system', 'awaiting_payment', 'new'],
    ['system', 'awaiting_payment', 'expired'],
    ['system', 'awaiting_payment', 'cancelled'],
    ['admin', 'awaiting_payment', 'cancelled'],
    ['admin', 'new', 'preparing'],
    ['admin', 'preparing', 'ready'],
    ['admin', 'ready', 'completed'],
    // one step back to fix a mis-tap in the kitchen
    ['admin', 'preparing', 'new'],
    ['admin', 'ready', 'preparing'],
    ['admin', 'completed', 'ready'],
    ['admin', 'new', 'cancelled'],
    ['admin', 'preparing', 'cancelled'],
    ['admin', 'ready', 'cancelled'],
  ];

  it.each(allowed)('%s may move %s -> %s', (actor, from, to) => {
    expect(canTransition(from, to, actor)).toBe(true);
    expect(transition(from, to, actor)).toBe(to);
  });
});

describe('forbidden transitions', () => {
  const forbidden: Array<[Actor, OrderStatus, OrderStatus, string]> = [
    ['admin', 'new', 'ready', 'skips a step'],
    ['admin', 'new', 'completed', 'skips steps'],
    ['admin', 'awaiting_payment', 'new', 'only a verified payment may mark an order as new'],
    ['admin', 'awaiting_payment', 'preparing', 'unpaid orders are not kitchen work'],
    ['system', 'new', 'preparing', 'the system never drives the kitchen'],
    ['system', 'ready', 'completed', 'the system never drives the kitchen'],
    ['admin', 'completed', 'cancelled', 'a collected order cannot be cancelled'],
    ['admin', 'cancelled', 'new', 'cancelled is final'],
    ['admin', 'expired', 'new', 'expired is final'],
    ['system', 'expired', 'new', 'expired is final'],
    ['admin', 'new', 'new', 'no-op transitions are errors'],
    ['customer', 'new', 'cancelled', 'customers do not change status'],
    ['customer', 'awaiting_payment', 'new', 'customers cannot self-mark as paid'],
  ];

  it.each(forbidden)('%s may NOT move %s -> %s (%s)', (actor, from, to) => {
    expect(canTransition(from, to, actor)).toBe(false);
    expect(() => transition(from, to, actor)).toThrow(InvalidTransitionError);
  });

  it('carries the details on the error', () => {
    try {
      transition('new', 'completed', 'admin');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect(e).toMatchObject({ from: 'new', to: 'completed', actor: 'admin' });
    }
  });

  it('leaves no way out of cancelled and expired for anyone', () => {
    for (const actor of ['system', 'admin', 'customer'] as const) {
      for (const to of ALL) {
        expect(canTransition('cancelled', to, actor)).toBe(false);
        expect(canTransition('expired', to, actor)).toBe(false);
      }
    }
  });
});

describe('kitchen flow helpers', () => {
  it('exposes the Nuovo -> In preparazione -> Pronto -> Ritirato order', () => {
    expect(STATUS_FLOW).toEqual(['new', 'preparing', 'ready', 'completed']);
  });

  it('knows the next and previous step', () => {
    expect(nextAdminStatus('new')).toBe('preparing');
    expect(nextAdminStatus('preparing')).toBe('ready');
    expect(nextAdminStatus('ready')).toBe('completed');
    expect(nextAdminStatus('completed')).toBeNull();
    expect(nextAdminStatus('awaiting_payment')).toBeNull();
    expect(nextAdminStatus('cancelled')).toBeNull();

    expect(previousAdminStatus('preparing')).toBe('new');
    expect(previousAdminStatus('ready')).toBe('preparing');
    expect(previousAdminStatus('completed')).toBe('ready');
    expect(previousAdminStatus('new')).toBeNull();
  });

  it('classifies statuses', () => {
    expect(ALL.filter(isTerminal)).toEqual(['completed', 'cancelled', 'expired']);
    expect(ALL.filter(isActive)).toEqual(['new', 'preparing', 'ready']);
    expect(ALL.filter(isPaidStatus)).toEqual(['new', 'preparing', 'ready', 'completed']);
  });
});
