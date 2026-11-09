import { describe, expect, it } from 'vitest';
import { describePickup, firstName, formatMoney, oneLine, phoneHref, pizzasLabel } from '@/server/email/format';

describe('formatMoney', () => {
  it('formats cents as euros with a plain space, safe for subjects and plain text', () => {
    expect(formatMoney(3250)).toBe('32,50 €');
    expect(formatMoney(0)).toBe('0,00 €');
    expect(formatMoney(5)).toBe('0,05 €');
    expect(formatMoney(3250)).not.toContain(' ');
  });
});

describe('pizzasLabel', () => {
  it('uses the Italian singular and plural', () => {
    expect(pizzasLabel(0)).toBe('nessuna pizza');
    expect(pizzasLabel(1)).toBe('1 pizza');
    expect(pizzasLabel(3)).toBe('3 pizze');
  });
});

describe('describePickup (Europe/Rome)', () => {
  it('says "oggi" for a pickup on the same Rome day', () => {
    const info = describePickup(new Date('2026-11-08T18:30:00Z'), new Date('2026-11-08T16:00:00Z'));
    expect(info).toEqual({ time: '19:30', dayWord: 'oggi', weekdayDate: 'domenica 8 novembre', isToday: true });
  });

  it('says "domani" for the next Rome day', () => {
    const info = describePickup(new Date('2026-11-09T18:30:00Z'), new Date('2026-11-08T16:00:00Z'));
    expect(info).toMatchObject({ time: '19:30', dayWord: 'domani', weekdayDate: 'lunedì 9 novembre', isToday: false });
  });

  it('uses weekday and date from the day after tomorrow on', () => {
    const info = describePickup(new Date('2026-11-10T18:30:00Z'), new Date('2026-11-08T16:00:00Z'));
    expect(info).toMatchObject({ dayWord: 'martedì 10 novembre', weekdayDate: 'martedì 10 novembre', isToday: false });
  });

  it('compares Rome calendar days, not UTC days (winter, UTC+1)', () => {
    // 23:30 in Rome on the 8th; the pickup is 00:30 in Rome on the 9th, although both are on the 8th in UTC.
    const info = describePickup(new Date('2026-11-08T23:30:00Z'), new Date('2026-11-08T22:30:00Z'));
    expect(info).toMatchObject({ time: '00:30', dayWord: 'domani' });
  });

  it('compares Rome calendar days, not UTC days (summer, UTC+2)', () => {
    const now = new Date('2026-07-14T21:30:00Z'); // 23:30 in Rome
    expect(describePickup(new Date('2026-07-14T17:30:00Z'), now)).toMatchObject({ time: '19:30', dayWord: 'oggi' });
    expect(describePickup(new Date('2026-07-14T22:30:00Z'), now)).toMatchObject({ time: '00:30', dayWord: 'domani' });
  });

  it('survives the day clocks go back (25 October 2026, 25 hours long)', () => {
    const now = new Date('2026-10-25T05:00:00Z'); // 06:00 in Rome (CET again)
    expect(describePickup(new Date('2026-10-25T17:00:00Z'), now)).toMatchObject({ time: '18:00', dayWord: 'oggi' });
    expect(describePickup(new Date('2026-10-26T17:00:00Z'), now)).toMatchObject({ time: '18:00', dayWord: 'domani' });
  });

  it('falls back to weekday and date for a pickup in the past', () => {
    const info = describePickup(new Date('2026-11-07T18:30:00Z'), new Date('2026-11-08T16:00:00Z'));
    expect(info).toMatchObject({ dayWord: 'sabato 7 novembre', isToday: false });
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Mario Rossi')).toBe('Mario');
    expect(firstName('  Anna   Maria Bianchi ')).toBe('Anna');
  });

  it('tidies names typed in capitals or all lowercase, parts after a hyphen or apostrophe included', () => {
    expect(firstName('GIUSEPPE VERDI')).toBe('Giuseppe');
    expect(firstName('luca')).toBe('Luca');
    expect(firstName("D'ANGELO Piero")).toBe("D'Angelo");
    expect(firstName('anna-maria rossi')).toBe('Anna-Maria');
  });

  it('keeps deliberate mixed case', () => {
    expect(firstName('McDonald Ronald')).toBe('McDonald');
  });

  it('is empty when there is no name', () => {
    expect(firstName('')).toBe('');
    expect(firstName('   ')).toBe('');
  });
});

describe('phoneHref', () => {
  it('keeps only the digits and a leading plus', () => {
    expect(phoneHref('+39 333 123 4567')).toBe('tel:+393331234567');
    expect(phoneHref('(333) 123-4567')).toBe('tel:3331234567');
  });

  it('refuses anything without digits', () => {
    expect(phoneHref('')).toBeNull();
    expect(phoneHref('<script>')).toBeNull();
  });
});

describe('oneLine', () => {
  it('collapses line breaks and runs of spaces so a field stays on one line', () => {
    expect(oneLine('  Mario\r\nRossi \n\n x  ')).toBe('Mario Rossi x');
  });
});
