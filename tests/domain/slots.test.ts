import { describe, expect, it } from 'vitest';
import {
  type SlotRules,
  type WeeklyHours,
  buildSlots,
  earliestSlotStart,
  toSlotKey,
  validateHours,
  validateSlot,
} from '@/domain/slots';

// Calendar used below (Europe/Rome, CET = UTC+1 in November; CEST = UTC+2 until 25 Oct 2026):
//   2026-11-08 Sun · 09 Mon (closed) · 10 Tue · 11 Wed · 12 Thu · 13 Fri · 14 Sat

const evening = [{ open: '18:00', close: '22:30' }];
const hours: WeeklyHours = {
  mon: [],
  tue: evening,
  wed: evening,
  thu: evening,
  fri: evening,
  sat: [{ open: '12:00', close: '14:30' }, ...evening],
  sun: evening,
};

const rules = (over: Partial<SlotRules> = {}): SlotRules => ({
  timezone: 'Europe/Rome',
  slotMinutes: 15,
  prepMinutes: 20,
  capacity: 8,
  maxDaysAhead: 2,
  hours,
  closedDates: [],
  shopOpen: true,
  reopenAt: null,
  ...over,
});

const at = (iso: string) => new Date(iso);
const morningOfTuesday = at('2026-11-10T08:00:00Z'); // 09:00 local
const day = (days: ReturnType<typeof buildSlots>, date: string) => days.find((d) => d.date === date)!;
const slot = (d: ReturnType<typeof day>, time: string) => d.slots.find((s) => s.time === time)!;

describe('toSlotKey', () => {
  it('is the UTC ISO instant without milliseconds, whatever the input spelling', () => {
    expect(toSlotKey(at('2026-11-10T17:00:00.000Z'))).toBe('2026-11-10T17:00:00Z');
    expect(toSlotKey(at('2026-11-10T18:00:00+01:00'))).toBe('2026-11-10T17:00:00Z');
  });
});

describe('buildSlots: the grid', () => {
  it('offers one slot per 15 minutes from opening to 15 minutes before closing', () => {
    const days = buildSlots({ now: morningOfTuesday, rules: rules(), load: {}, pizzaCount: 1 });
    const tue = day(days, '2026-11-10');
    expect(tue.closed).toBe(false);
    expect(tue.slots).toHaveLength(18);
    expect(tue.slots[0]).toMatchObject({ time: '18:00', startIso: '2026-11-10T17:00:00Z', available: true, remaining: 8 });
    expect(tue.slots.at(-1)!.time).toBe('22:15');
  });

  it('returns today plus maxDaysAhead days', () => {
    expect(buildSlots({ now: morningOfTuesday, rules: rules({ maxDaysAhead: 0 }), load: {}, pizzaCount: 1 })).toHaveLength(1);
    expect(buildSlots({ now: morningOfTuesday, rules: rules({ maxDaysAhead: 2 }), load: {}, pizzaCount: 1 })).toHaveLength(3);
  });

  it('supports split shifts', () => {
    const days = buildSlots({ now: at('2026-11-13T10:00:00Z'), rules: rules({ maxDaysAhead: 1 }), load: {}, pizzaCount: 1 });
    const sat = day(days, '2026-11-14');
    expect(sat.slots.map((s) => s.time).slice(0, 3)).toEqual(['12:00', '12:15', '12:30']);
    expect(sat.slots).toHaveLength(10 + 18);
    expect(slot(sat, '14:15')).toBeDefined();
    expect(sat.slots.find((s) => s.time === '14:30')).toBeUndefined();
    expect(slot(sat, '18:00')).toBeDefined();
  });

  it('keeps local opening times across the autumn DST change', () => {
    const days = buildSlots({ now: at('2026-10-22T10:00:00Z'), rules: rules({ maxDaysAhead: 3 }), load: {}, pizzaCount: 1 });
    // Sat 24 Oct is still CEST (UTC+2), Sun 25 Oct is CET (UTC+1) after the 03:00 change.
    expect(slot(day(days, '2026-10-24'), '18:00').startIso).toBe('2026-10-24T16:00:00Z');
    expect(slot(day(days, '2026-10-25'), '18:00').startIso).toBe('2026-10-25T17:00:00Z');
  });
});

describe('buildSlots: lead time', () => {
  it('earliest slot is now + prep time rounded up to the grid', () => {
    const now = at('2026-11-10T18:07:00Z'); // 19:07 local -> 19:27 -> 19:30
    const tue = day(buildSlots({ now, rules: rules(), load: {}, pizzaCount: 1 }), '2026-11-10');
    expect(slot(tue, '19:15')).toMatchObject({ available: false, reason: 'too_soon' });
    expect(slot(tue, '19:30')).toMatchObject({ available: true });
  });

  it('keeps an exact grid boundary', () => {
    const now = at('2026-11-10T18:10:00Z'); // 19:10 + 20 min = 19:30 exactly
    const tue = day(buildSlots({ now, rules: rules(), load: {}, pizzaCount: 1 }), '2026-11-10');
    expect(slot(tue, '19:15').available).toBe(false);
    expect(slot(tue, '19:30').available).toBe(true);
  });

  it('rounds up when there are leftover seconds', () => {
    const now = at('2026-11-10T18:10:30Z'); // 19:10:30 + 20 = 19:30:30 -> 19:45
    const tue = day(buildSlots({ now, rules: rules(), load: {}, pizzaCount: 1 }), '2026-11-10');
    expect(slot(tue, '19:30').available).toBe(false);
    expect(slot(tue, '19:45').available).toBe(true);
  });

  it('lets customers pre-order for opening time when the shop is not open yet', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: {}, pizzaCount: 1 }), '2026-11-10');
    expect(slot(tue, '18:00').available).toBe(true);
  });

  it('has no available slot left today once the evening is over', () => {
    const now = at('2026-11-10T21:30:00Z'); // 22:30 local, closing time
    const days = buildSlots({ now, rules: rules(), load: {}, pizzaCount: 1 });
    expect(day(days, '2026-11-10').slots.every((s) => !s.available)).toBe(true);
    expect(day(days, '2026-11-11').slots.every((s) => s.available)).toBe(true);
  });

  it('exposes the earliest start as a Date', () => {
    expect(earliestSlotStart(at('2026-11-10T18:07:00Z'), rules()).toISOString()).toBe('2026-11-10T18:30:00.000Z');
  });
});

describe('buildSlots: capacity', () => {
  const full = '2026-11-10T18:30:00Z'; // 19:30 local

  it('marks a slot full when load + this order would exceed capacity', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: { [full]: 6 }, pizzaCount: 3 }), '2026-11-10');
    expect(slot(tue, '19:30')).toMatchObject({ available: false, reason: 'full', remaining: 2 });
  });

  it('keeps the slot open when the order fits exactly', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: { [full]: 6 }, pizzaCount: 2 }), '2026-11-10');
    expect(slot(tue, '19:30')).toMatchObject({ available: true, remaining: 2 });
  });

  it('never reports negative remaining capacity', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: { [full]: 11 }, pizzaCount: 1 }), '2026-11-10');
    expect(slot(tue, '19:30').remaining).toBe(0);
  });

  it('rejects every slot when one order alone exceeds a slot capacity', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: {}, pizzaCount: 9 }), '2026-11-10');
    expect(tue.slots.every((s) => !s.available && s.reason === 'too_many_pizzas')).toBe(true);
  });

  it('ignores capacity for an order with no pizzas (drinks only)', () => {
    const tue = day(buildSlots({ now: morningOfTuesday, rules: rules(), load: { [full]: 10 }, pizzaCount: 0 }), '2026-11-10');
    expect(slot(tue, '19:30').available).toBe(true);
  });
});

describe('buildSlots: closures', () => {
  it('reports a weekday without hours as closed', () => {
    const days = buildSlots({ now: at('2026-11-08T10:00:00Z'), rules: rules(), load: {}, pizzaCount: 1 });
    expect(day(days, '2026-11-09')).toMatchObject({ weekday: 'mon', closed: true, closedReason: 'closed_day', slots: [] });
    expect(day(days, '2026-11-08').closed).toBe(false);
  });

  it('reports a listed holiday as closed', () => {
    const days = buildSlots({ now: morningOfTuesday, rules: rules({ closedDates: ['2026-11-10'] }), load: {}, pizzaCount: 1 });
    expect(day(days, '2026-11-10')).toMatchObject({ closed: true, closedReason: 'holiday', slots: [] });
    expect(day(days, '2026-11-11').closed).toBe(false);
  });

  it('closes everything while the shop is temporarily closed with no reopening time', () => {
    const days = buildSlots({ now: morningOfTuesday, rules: rules({ shopOpen: false }), load: {}, pizzaCount: 1 });
    expect(days.every((d) => d.closed && d.closedReason === 'shop_closed' && d.slots.length === 0)).toBe(true);
  });

  it('reopens by itself once the reopening time has passed', () => {
    const days = buildSlots({
      now: morningOfTuesday,
      rules: rules({ shopOpen: false, reopenAt: at('2026-11-10T07:00:00Z') }),
      load: {},
      pizzaCount: 1,
    });
    expect(day(days, '2026-11-10').closed).toBe(false);
  });

  it('stays closed until a future reopening time, then offers slots', () => {
    const days = buildSlots({
      now: morningOfTuesday,
      rules: rules({ shopOpen: false, reopenAt: at('2026-11-11T05:00:00Z') }), // Wed 06:00 local
      load: {},
      pizzaCount: 1,
    });
    expect(day(days, '2026-11-10')).toMatchObject({ closed: true, closedReason: 'shop_closed' });
    expect(day(days, '2026-11-11').closed).toBe(false);
    expect(slot(day(days, '2026-11-11'), '18:00').available).toBe(true);
  });
});

describe('validateSlot', () => {
  const base = { now: morningOfTuesday, rules: rules(), load: {}, pizzaCount: 2 };

  it('accepts an available slot, whatever the ISO spelling', () => {
    expect(validateSlot({ ...base, startIso: '2026-11-10T18:30:00.000Z' })).toMatchObject({ ok: true });
    expect(validateSlot({ ...base, startIso: '2026-11-10T19:30:00+01:00' })).toMatchObject({ ok: true });
  });

  it('rejects times that are not on the grid', () => {
    expect(validateSlot({ ...base, startIso: '2026-11-10T18:37:00Z' })).toEqual({ ok: false, reason: 'not_a_slot' });
    expect(validateSlot({ ...base, startIso: 'banana' })).toEqual({ ok: false, reason: 'not_a_slot' });
  });

  it('rejects a time outside opening hours', () => {
    expect(validateSlot({ ...base, startIso: '2026-11-10T02:00:00Z' })).toEqual({ ok: false, reason: 'closed' });
  });

  it('rejects a closed day and the holiday case', () => {
    expect(validateSlot({ ...base, now: at('2026-11-08T10:00:00Z'), startIso: '2026-11-09T18:00:00Z' })).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(validateSlot({ ...base, rules: rules({ closedDates: ['2026-11-10'] }), startIso: '2026-11-10T18:30:00Z' })).toEqual({
      ok: false,
      reason: 'closed',
    });
  });

  it('rejects slots beyond the booking horizon', () => {
    expect(validateSlot({ ...base, startIso: '2026-11-13T18:30:00Z' })).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('rejects slots that are too soon, full, or too big for one slot', () => {
    expect(validateSlot({ ...base, now: at('2026-11-10T18:07:00Z'), startIso: '2026-11-10T18:15:00Z' })).toEqual({
      ok: false,
      reason: 'too_soon',
    });
    expect(validateSlot({ ...base, load: { '2026-11-10T18:30:00Z': 7 }, startIso: '2026-11-10T18:30:00Z' })).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(validateSlot({ ...base, pizzaCount: 9, startIso: '2026-11-10T18:30:00Z' })).toEqual({
      ok: false,
      reason: 'too_many_pizzas',
    });
  });
});

describe('validateHours', () => {
  it('accepts well-formed hours', () => {
    expect(validateHours(hours)).toEqual([]);
  });

  it('flags malformed times', () => {
    const problems = validateHours({ ...hours, tue: [{ open: '25:00', close: '22:00' }] });
    expect(problems).toEqual([{ weekday: 'tue', code: 'invalid_time' }]);
  });

  it('flags a range that does not open before it closes', () => {
    expect(validateHours({ ...hours, wed: [{ open: '22:00', close: '18:00' }] })).toEqual([
      { weekday: 'wed', code: 'open_not_before_close' },
    ]);
  });

  it('flags overlapping ranges on the same day', () => {
    const problems = validateHours({
      ...hours,
      thu: [
        { open: '12:00', close: '15:00' },
        { open: '14:00', close: '16:00' },
      ],
    });
    expect(problems).toEqual([{ weekday: 'thu', code: 'overlap' }]);
  });

  it('allows adjacent ranges', () => {
    expect(
      validateHours({
        ...hours,
        fri: [
          { open: '12:00', close: '15:00' },
          { open: '15:00', close: '16:00' },
        ],
      }),
    ).toEqual([]);
  });
});
