import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  transition,
  type OrderState,
  type OrderStatus,
} from './order-state.js';

const ALL: OrderStatus[] = [
  'RECEIVED',
  'VALIDATED',
  'REJECTED',
  'ACCEPTED',
  'SENT_TO_POS',
  'PRINT_CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'NEEDS_ATTENTION',
];
const FINAL: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const NON_FINAL = ALL.filter((s) => !FINAL.includes(s));

const t1 = new Date('2026-11-07T10:00:00Z');
const t2 = new Date('2026-11-07T10:01:00Z');
const t3 = new Date('2026-11-07T10:02:00Z');
const t4 = new Date('2026-11-07T10:03:00Z');

const start: OrderState = { status: 'RECEIVED' };

function run(initial: OrderState, steps: OrderStatus[]): OrderState {
  let s = initial;
  let i = 0;
  for (const to of steps) {
    s = transition(s, to, new Date(t1.getTime() + i++ * 1000));
  }
  return s;
}

/** A state of the given status reached through legal transitions. */
function reach(status: OrderStatus): OrderState {
  switch (status) {
    case 'RECEIVED':
      return start;
    case 'VALIDATED':
      return run(start, ['VALIDATED']);
    case 'REJECTED':
      return run(start, ['REJECTED']);
    case 'ACCEPTED':
      return run(start, ['VALIDATED', 'ACCEPTED']);
    case 'SENT_TO_POS':
      return run(start, ['VALIDATED', 'ACCEPTED', 'SENT_TO_POS']);
    case 'PRINT_CONFIRMED':
      return run(start, ['VALIDATED', 'ACCEPTED', 'SENT_TO_POS', 'PRINT_CONFIRMED']);
    case 'READY':
      return run(start, ['VALIDATED', 'ACCEPTED', 'SENT_TO_POS', 'PRINT_CONFIRMED', 'READY']);
    case 'COMPLETED':
      return run(reach('READY'), ['COMPLETED']);
    case 'CANCELLED':
      return run(start, ['CANCELLED']);
    case 'NEEDS_ATTENTION':
      return run(start, ['NEEDS_ATTENTION']);
  }
}

describe('allowed transitions (spec 8.1)', () => {
  it.each([
    ['RECEIVED', 'VALIDATED'],
    ['RECEIVED', 'REJECTED'],
    ['VALIDATED', 'ACCEPTED'],
    ['ACCEPTED', 'SENT_TO_POS'],
    ['SENT_TO_POS', 'PRINT_CONFIRMED'],
    ['READY', 'COMPLETED'],
  ] as [OrderStatus, OrderStatus][])('%s -> %s succeeds', (from, to) => {
    expect(transition(reach(from), to, t4).status).toBe(to);
  });

  it('walks the whole happy path', () => {
    const s = run(start, [
      'VALIDATED',
      'ACCEPTED',
      'SENT_TO_POS',
      'PRINT_CONFIRMED',
      'READY',
      'COMPLETED',
    ]);
    expect(s.status).toBe('COMPLETED');
  });

  it('rejects RECEIVED -> READY and VALIDATED -> SENT_TO_POS', () => {
    expect(() => transition(reach('RECEIVED'), 'READY', t1)).toThrow(InvalidTransitionError);
    expect(() => transition(reach('VALIDATED'), 'SENT_TO_POS', t1)).toThrow(
      InvalidTransitionError,
    );
  });

  it('rejects skipping validation and self-transitions', () => {
    expect(() => transition(reach('RECEIVED'), 'ACCEPTED', t1)).toThrow(InvalidTransitionError);
    expect(() => transition(reach('VALIDATED'), 'REJECTED', t1)).toThrow(InvalidTransitionError);
    expect(() => transition(reach('ACCEPTED'), 'ACCEPTED', t1)).toThrow(InvalidTransitionError);
  });

  it('rejects READY -> earlier tracks', () => {
    expect(() => transition(reach('READY'), 'SENT_TO_POS', t4)).toThrow(InvalidTransitionError);
    expect(() => transition(reach('READY'), 'PRINT_CONFIRMED', t4)).toThrow(
      InvalidTransitionError,
    );
  });
});

describe('independent POS and print tracks', () => {
  it('entering SENT_TO_POS sets posConfirmedAt only', () => {
    const s = transition(reach('ACCEPTED'), 'SENT_TO_POS', t3);
    expect(s.posConfirmedAt).toEqual(t3);
    expect(s.printConfirmedAt).toBeUndefined();
  });

  it('entering PRINT_CONFIRMED sets printConfirmedAt', () => {
    const s = transition(reach('SENT_TO_POS'), 'PRINT_CONFIRMED', t4);
    expect(s.printConfirmedAt).toEqual(t4);
    expect(s.posConfirmedAt).toBeDefined();
  });

  it('allows print before POS: ACCEPTED -> PRINT_CONFIRMED -> SENT_TO_POS -> READY', () => {
    const s = run(reach('ACCEPTED'), ['PRINT_CONFIRMED', 'SENT_TO_POS', 'READY']);
    expect(s.status).toBe('READY');
    expect(s.posConfirmedAt).toBeDefined();
    expect(s.printConfirmedAt).toBeDefined();
  });

  it('allows READY straight after PRINT_CONFIRMED when POS marker is set', () => {
    expect(transition(reach('PRINT_CONFIRMED'), 'READY', t4).status).toBe('READY');
  });

  it('rejects ACCEPTED -> SENT_TO_POS -> READY (print marker missing)', () => {
    expect(() => run(reach('ACCEPTED'), ['SENT_TO_POS', 'READY'])).toThrow(
      InvalidTransitionError,
    );
  });

  it('rejects ACCEPTED -> PRINT_CONFIRMED -> READY (POS marker missing)', () => {
    expect(() => run(reach('ACCEPTED'), ['PRINT_CONFIRMED', 'READY'])).toThrow(
      InvalidTransitionError,
    );
  });

  it('rejects READY directly from ACCEPTED', () => {
    expect(() => transition(reach('ACCEPTED'), 'READY', t1)).toThrow(InvalidTransitionError);
  });

  it('does not let a track be entered twice (marker would be overwritten)', () => {
    // SENT_TO_POS -> PRINT_CONFIRMED -> SENT_TO_POS: POS marker already set
    expect(() => transition(reach('PRINT_CONFIRMED'), 'SENT_TO_POS', t4)).toThrow(
      InvalidTransitionError,
    );
    // PRINT_CONFIRMED (first) -> SENT_TO_POS -> PRINT_CONFIRMED: print marker already set
    const printFirstThenPos = run(reach('ACCEPTED'), ['PRINT_CONFIRMED', 'SENT_TO_POS']);
    expect(() => transition(printFirstThenPos, 'PRINT_CONFIRMED', t4)).toThrow(
      InvalidTransitionError,
    );
  });
});

describe('NEEDS_ATTENTION', () => {
  it.each(NON_FINAL.filter((s) => s !== 'NEEDS_ATTENTION'))(
    '%s -> NEEDS_ATTENTION stores previousStatus and can be resolved',
    (from) => {
      const s = reach(from);
      const attn = transition(s, 'NEEDS_ATTENTION', t4);
      expect(attn.status).toBe('NEEDS_ATTENTION');
      expect(attn.previousStatus).toBe(from);
      const back = transition(attn, from, t4);
      expect(back.status).toBe(from);
      expect(back.previousStatus).toBeUndefined();
      expect(back.posConfirmedAt).toEqual(s.posConfirmedAt);
      expect(back.printConfirmedAt).toEqual(s.printConfirmedAt);
    },
  );

  it('may be cancelled directly (spec 8.1: any non-final -> CANCELLED)', () => {
    const attn = transition(reach('SENT_TO_POS'), 'NEEDS_ATTENTION', t4);
    expect(transition(attn, 'CANCELLED', t4).status).toBe('CANCELLED');
  });

  it('may only return to the previous status or be cancelled', () => {
    const attn = transition(reach('ACCEPTED'), 'NEEDS_ATTENTION', t4);
    for (const to of ALL.filter((s) => s !== 'ACCEPTED' && s !== 'CANCELLED')) {
      expect(() => transition(attn, to, t4)).toThrow(InvalidTransitionError);
    }
  });

  it('preserves markers across the detour', () => {
    const s = run(reach('ACCEPTED'), ['PRINT_CONFIRMED', 'NEEDS_ATTENTION', 'PRINT_CONFIRMED']);
    expect(s.status).toBe('PRINT_CONFIRMED');
    expect(s.printConfirmedAt).toBeDefined();
    expect(transition(s, 'SENT_TO_POS', t4).status).toBe('SENT_TO_POS');
  });

  it('keeps the READY guard after a detour', () => {
    const attn = transition(reach('SENT_TO_POS'), 'NEEDS_ATTENTION', t4);
    const back = transition(attn, 'SENT_TO_POS', t4);
    expect(() => transition(back, 'READY', t4)).toThrow(InvalidTransitionError);
  });

  it('does not nest NEEDS_ATTENTION', () => {
    const attn = reach('NEEDS_ATTENTION');
    expect(() => transition(attn, 'NEEDS_ATTENTION', t4)).toThrow(InvalidTransitionError);
  });
});

describe('CANCELLED', () => {
  it.each(NON_FINAL.filter((s) => s !== 'NEEDS_ATTENTION'))('%s -> CANCELLED', (from) => {
    expect(transition(reach(from), 'CANCELLED', t4).status).toBe('CANCELLED');
  });
});

describe('final states', () => {
  for (const finalStatus of FINAL) {
    it(`${finalStatus} rejects every target`, () => {
      const s = reach(finalStatus);
      for (const to of ALL) {
        expect(() => transition(s, to, t4)).toThrow(InvalidTransitionError);
      }
    });
  }
});

describe('purity', () => {
  it('does not mutate the input state', () => {
    const input: OrderState = { status: 'ACCEPTED' };
    const snapshot = { ...input };
    const out = transition(input, 'SENT_TO_POS', t1);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });

  it('does not mutate the input when it throws', () => {
    const input = reach('SENT_TO_POS');
    const snapshot = { ...input };
    expect(() => transition(input, 'READY', t4)).toThrow(InvalidTransitionError);
    expect(input).toEqual(snapshot);
  });

  it('InvalidTransitionError carries a useful name and message', () => {
    try {
      transition(reach('RECEIVED'), 'READY', t1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe('InvalidTransitionError');
      expect((e as Error).message).toContain('RECEIVED');
      expect((e as Error).message).toContain('READY');
    }
  });
});
