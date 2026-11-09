import { DateTime } from 'luxon';
import { business } from '@/config/business';
import { formatEUR } from '@/domain/money';

/** Text helpers shared by the email templates. All user-visible wording is Italian, times are Europe/Rome. */

/** "32,50 €". `formatEUR` puts a no-break space before the euro sign; subjects and plain text want a normal one. */
export function formatMoney(cents: number): string {
  return formatEUR(cents).replace(/ /g, ' ');
}

export function pizzasLabel(count: number): string {
  if (count <= 0) return 'nessuna pizza';
  return count === 1 ? '1 pizza' : `${count} pizze`;
}

export interface PickupInfo {
  /** Local wall-clock time, "19:30". */
  time: string;
  /** "oggi", "domani", otherwise weekday and date ("martedì 10 novembre"). Reads well after "ritiro ...". */
  dayWord: string;
  weekdayDate: string;
  isToday: boolean;
}

/**
 * Describes a pickup instant relative to `now`, comparing calendar days in the business time zone
 * (so 00:30 Rome time is "domani" even when both instants share a UTC date).
 */
export function describePickup(pickupAt: Date, now: Date, timezone: string = business.timezone): PickupInfo {
  const pickup = DateTime.fromJSDate(pickupAt, { zone: timezone }).setLocale('it');
  const today = DateTime.fromJSDate(now, { zone: timezone });

  const asUtcDate = (dt: DateTime) => DateTime.fromISO(dt.toISODate()!, { zone: 'utc' });
  const dayDiff = Math.round(asUtcDate(pickup).diff(asUtcDate(today), 'days').days);

  const weekdayDate = pickup.toFormat('cccc d MMMM');
  const dayWord = dayDiff === 0 ? 'oggi' : dayDiff === 1 ? 'domani' : weekdayDate;
  return { time: pickup.toFormat('HH:mm'), dayWord, weekdayDate, isToday: dayDiff === 0 };
}

function titleCaseWord(word: string): string {
  return word
    .split(/(['’-])/)
    .map((part) => (/^['’-]$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('');
}

/**
 * The word to greet the customer with. Names typed in capitals or all lowercase are tidied ("GIUSEPPE" -> "Giuseppe");
 * deliberate mixed case ("McDonald") is left alone.
 */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  if (first === '') return '';
  const isUniformCase = first === first.toUpperCase() || first === first.toLowerCase();
  return isUniformCase ? titleCaseWord(first) : first;
}

/** `tel:` link made only of digits and an optional leading plus, or null when the number has no digits. */
export function phoneHref(phone: string): string | null {
  const plus = phone.trim().startsWith('+') ? '+' : '';
  const digits = phone.replace(/\D/g, '');
  return digits === '' ? null : `tel:${plus}${digits}`;
}

/** Keeps a single-line field (name, phone) on one line in the plain-text part. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
