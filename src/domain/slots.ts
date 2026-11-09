import { DateTime } from 'luxon';

/**
 * Pickup-slot engine. Pure: the caller passes "now", the rules and the current load per slot.
 *
 * - Slots sit on a fixed grid (default 15 min) inside opening hours; the last one starts a slot-length before closing.
 * - The earliest bookable slot is `now + prep time`, rounded up to the grid.
 * - Capacity is counted in pizzas per slot. An order fits if `load + its pizzas <= capacity`; an order with no
 *   pizzas (drinks only) ignores capacity.
 * - All wall-clock logic happens in the business time zone (Europe/Rome), so DST changes are handled by Luxon.
 * - Closing times must be on the same day (use 23:59 as the latest close).
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface OpeningRange {
  /** "HH:mm", 24h, local time. */
  open: string;
  close: string;
}
export type WeeklyHours = Record<Weekday, OpeningRange[]>;

export interface SlotRules {
  timezone: string;
  slotMinutes: number;
  prepMinutes: number;
  /** Max pizzas per slot. */
  capacity: number;
  /** 0 = today only. */
  maxDaysAhead: number;
  hours: WeeklyHours;
  /** Local dates "YYYY-MM-DD" the shop is closed (holidays). */
  closedDates: readonly string[];
  /** false = temporarily closed. */
  shopOpen: boolean;
  /** While closed, slots starting at or after this instant are bookable again. */
  reopenAt?: Date | null;
}

export type SlotUnavailableReason = 'too_soon' | 'full' | 'too_many_pizzas' | 'shop_closed';

export interface SlotOption {
  /** Canonical UTC key, e.g. "2026-11-10T17:00:00Z". Use this to talk to the server and the database. */
  startIso: string;
  /** Local "HH:mm". */
  time: string;
  available: boolean;
  reason?: SlotUnavailableReason;
  /** Pizzas still bookable in this slot (never negative). */
  remaining: number;
}

export type DayClosedReason = 'closed_day' | 'holiday' | 'shop_closed';

export interface DaySlots {
  /** Local date "YYYY-MM-DD". */
  date: string;
  weekday: Weekday;
  closed: boolean;
  closedReason?: DayClosedReason;
  slots: SlotOption[];
}

export type SlotRejection = 'not_a_slot' | 'out_of_range' | 'closed' | 'too_soon' | 'full' | 'too_many_pizzas';

export interface HoursProblem {
  weekday: Weekday;
  code: 'invalid_time' | 'open_not_before_close' | 'overlap';
}

/** Canonical key for a slot start: the UTC instant, ISO-8601, without milliseconds. */
export function toSlotKey(date: Date): string {
  return date.toISOString().replace('.000Z', 'Z');
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = HHMM.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Checks well-formedness of weekly hours; used by the admin settings form. */
export function validateHours(hours: WeeklyHours): HoursProblem[] {
  const problems: HoursProblem[] = [];
  for (const weekday of WEEKDAYS) {
    const valid: Array<{ start: number; end: number }> = [];
    for (const range of hours[weekday]) {
      const open = parseTime(range.open);
      const close = parseTime(range.close);
      if (!open || !close) {
        problems.push({ weekday, code: 'invalid_time' });
        continue;
      }
      const start = open.hour * 60 + open.minute;
      const end = close.hour * 60 + close.minute;
      if (start >= end) {
        problems.push({ weekday, code: 'open_not_before_close' });
        continue;
      }
      valid.push({ start, end });
    }
    valid.sort((a, b) => a.start - b.start);
    for (let i = 1; i < valid.length; i++) {
      if (valid[i]!.start < valid[i - 1]!.end) problems.push({ weekday, code: 'overlap' });
    }
  }
  return problems;
}

/** `now + prep`, rounded up to the next slot boundary (in local time). */
export function earliestSlotStart(now: Date, rules: Pick<SlotRules, 'timezone' | 'prepMinutes' | 'slotMinutes'>): Date {
  const target = DateTime.fromMillis(now.getTime() + rules.prepMinutes * 60_000, { zone: rules.timezone });
  const hasFraction = target.second !== 0 || target.millisecond !== 0;
  const base = hasFraction ? target.startOf('minute').plus({ minutes: 1 }) : target.startOf('minute');
  const remainder = base.minute % rules.slotMinutes;
  const aligned = remainder === 0 ? base : base.plus({ minutes: rules.slotMinutes - remainder });
  return aligned.toJSDate();
}

export interface BuildSlotsInput {
  now: Date;
  rules: SlotRules;
  /** Pizzas already booked per slot, keyed by `toSlotKey`. */
  load: Readonly<Record<string, number>>;
  /** Pizzas in the order being placed. */
  pizzaCount: number;
}

export function buildSlots({ now, rules, load, pizzaCount }: BuildSlotsInput): DaySlots[] {
  const zone = rules.timezone;
  const today = DateTime.fromJSDate(now, { zone }).startOf('day');
  const earliest = earliestSlotStart(now, rules).getTime();
  const reopenAtMs = rules.reopenAt ? rules.reopenAt.getTime() : null;
  const blockedByClosure = (startMs: number) => !rules.shopOpen && (reopenAtMs === null || startMs < reopenAtMs);

  const result: DaySlots[] = [];
  for (let i = 0; i <= rules.maxDaysAhead; i++) {
    const dayStart = today.plus({ days: i }).startOf('day');
    const date = dayStart.toISODate()!;
    const weekday = WEEKDAYS[dayStart.weekday - 1]!;
    const ranges = rules.hours[weekday];

    if (ranges.length === 0) {
      result.push({ date, weekday, closed: true, closedReason: 'closed_day', slots: [] });
      continue;
    }
    if (rules.closedDates.includes(date)) {
      result.push({ date, weekday, closed: true, closedReason: 'holiday', slots: [] });
      continue;
    }

    const slots: SlotOption[] = [];
    for (const range of [...ranges].sort((a, b) => a.open.localeCompare(b.open))) {
      const open = parseTime(range.open);
      const close = parseTime(range.close);
      if (!open || !close) continue;
      const lastStart = dayStart.set({ hour: close.hour, minute: close.minute }).minus({ minutes: rules.slotMinutes });
      for (let t = dayStart.set({ hour: open.hour, minute: open.minute }); t <= lastStart; t = t.plus({ minutes: rules.slotMinutes })) {
        const startMs = t.toMillis();
        const startIso = toSlotKey(new Date(startMs));
        const booked = load[startIso] ?? 0;
        const remaining = Math.max(0, rules.capacity - booked);

        let reason: SlotUnavailableReason | undefined;
        if (blockedByClosure(startMs)) reason = 'shop_closed';
        else if (startMs < earliest) reason = 'too_soon';
        else if (pizzaCount > rules.capacity) reason = 'too_many_pizzas';
        else if (pizzaCount > 0 && booked + pizzaCount > rules.capacity) reason = 'full';

        slots.push({ startIso, time: t.toFormat('HH:mm'), available: reason === undefined, ...(reason ? { reason } : {}), remaining });
      }
    }

    if (slots.length > 0 && slots.every((s) => s.reason === 'shop_closed')) {
      result.push({ date, weekday, closed: true, closedReason: 'shop_closed', slots: [] });
    } else if (slots.length === 0) {
      result.push({ date, weekday, closed: true, closedReason: 'closed_day', slots: [] });
    } else {
      result.push({ date, weekday, closed: false, slots });
    }
  }
  return result;
}

export type SlotValidation = { ok: true; slot: SlotOption } | { ok: false; reason: SlotRejection };

/** Server-side check of the slot a customer picked. Re-run inside the order transaction, under the slot lock. */
export function validateSlot(input: BuildSlotsInput & { startIso: string }): SlotValidation {
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: 'not_a_slot' };

  const local = DateTime.fromJSDate(start, { zone: input.rules.timezone });
  if (local.second !== 0 || local.millisecond !== 0 || local.minute % input.rules.slotMinutes !== 0) {
    return { ok: false, reason: 'not_a_slot' };
  }

  const day = buildSlots(input).find((d) => d.date === local.toISODate());
  if (!day) return { ok: false, reason: 'out_of_range' };

  const option = day.slots.find((s) => s.startIso === toSlotKey(start));
  if (!option) return { ok: false, reason: 'closed' };
  if (option.available) return { ok: true, slot: option };
  return { ok: false, reason: option.reason === 'shop_closed' || option.reason === undefined ? 'closed' : option.reason };
}
