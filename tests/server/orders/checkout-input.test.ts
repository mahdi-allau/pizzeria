import { describe, expect, it } from 'vitest';
import { checkoutInputSchema, fieldErrors, normalizePhone } from '@/server/orders';
import { checkoutBody } from './_fixtures';

describe('normalizePhone', () => {
  it.each([
    ['333 123 4567', '+393331234567'],
    ['333.123.45.67', '+393331234567'],
    ['(06) 1234-5678', '+390612345678'],
    ['0039 333 1234567', '+393331234567'],
    ['+39 333 1234567', '+393331234567'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
});

describe('checkoutInputSchema', () => {
  it('accepts a valid body and normalises customer fields', () => {
    const parsed = checkoutInputSchema.parse(checkoutBody({ customer: { name: '  Mario Rossi ', phone: '333 123 4567', email: ' Mario.Rossi@Example.IT ' } }));
    expect(parsed.customer).toEqual({ name: 'Mario Rossi', phone: '+393331234567', email: 'mario.rossi@example.it' });
    expect(parsed.notes).toBeUndefined();
  });

  it('strips any client-side price on cart lines', () => {
    const body = checkoutBody({ cart: [{ type: 'product', slug: 'coca-cola-33', quantity: 1, unitPriceCents: 1 }] });
    const parsed = checkoutInputSchema.parse(body);
    expect(parsed.cart[0]).not.toHaveProperty('unitPriceCents');
  });

  it('drops blank notes and rejects notes over 300 chars', () => {
    expect(checkoutInputSchema.parse(checkoutBody({ notes: '   ' })).notes).toBeUndefined();
    expect(checkoutInputSchema.parse(checkoutBody({ notes: ' citofono rotto ' })).notes).toBe('citofono rotto');
    expect(checkoutInputSchema.safeParse(checkoutBody({ notes: 'x'.repeat(301) })).success).toBe(false);
  });

  it('maps field errors to dotted paths with Italian messages', () => {
    const result = checkoutInputSchema.safeParse(
      checkoutBody({
        clientRequestId: 'nope',
        customer: { name: 'M', phone: '12', email: 'not-an-email' },
        acceptTerms: false,
        expectedTotalCents: -1,
        pickupAt: 'domani',
      }),
    );
    expect(result.success).toBe(false);
    const fields = fieldErrors(result.error!);
    expect(Object.keys(fields).sort()).toEqual(
      ['acceptTerms', 'clientRequestId', 'customer.email', 'customer.name', 'customer.phone', 'expectedTotalCents', 'pickupAt'].sort(),
    );
    expect(fields['customer.email']).toBe('Inserisci un indirizzo email valido.');
    expect(fields['customer.name']).toMatch(/nome/i);
    expect(fields['customer.phone']).toMatch(/telefono/i);
    expect(fields.acceptTerms).toMatch(/condizioni/i);
  });

  it('rejects an empty cart', () => {
    const result = checkoutInputSchema.safeParse(checkoutBody({ cart: [] }));
    expect(result.success).toBe(false);
    expect(Object.keys(fieldErrors(result.error!))).toContain('cart');
  });

  it('accepts a pickup time with an offset', () => {
    expect(checkoutInputSchema.safeParse(checkoutBody({ pickupAt: '2026-11-10T18:00:00+01:00' })).success).toBe(true);
  });
});
