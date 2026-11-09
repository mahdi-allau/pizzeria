import type { WeeklyHours } from '@/domain/slots';

/**
 * ONE FILE TO REBRAND.
 *
 * Everything customer-facing that belongs to the business lives here: name, legal data, address, phone, brand
 * colours and the *initial* opening hours / ordering rules.
 *
 *  - Colours become CSS variables at runtime (see `brandCssVariables`), so changing them here re-skins the whole site.
 *  - Hours and ordering rules below only SEED the database on first run. After that the admin edits them in
 *    /admin/impostazioni and the database is the source of truth.
 *  - Fonts are swapped in `src/app/fonts.ts` (next/font needs static imports).
 *
 * Every value marked TODO is a placeholder to replace before going live (see README "Cosa devi fornire").
 */

const evening = [{ open: '18:00', close: '22:30' }];

const hours = {
  mon: [],
  tue: evening,
  wed: evening,
  thu: evening,
  fri: evening,
  sat: [{ open: '12:00', close: '14:30' }, ...evening],
  sun: [{ open: '12:00', close: '14:30' }, ...evening],
} satisfies WeeklyHours;

export const business = {
  name: 'Pizzeria La Brace', // TODO: real business name
  shortName: 'La Brace',
  tagline: 'La tua pizza, come la vuoi tu.',
  description:
    'Ordina online la pizza d’asporto: scegli un classico o creala ingrediente per ingrediente. Ritiri in pizzeria all’orario che preferisci.',

  legal: {
    companyName: 'La Brace S.r.l. [TODO: ragione sociale]',
    vatNumber: 'P.IVA 00000000000 [TODO]',
    reaNumber: 'REA RM-0000000 [TODO]',
    pec: 'pec@example.it [TODO]',
    registeredOffice: 'Via Esempio 1, 00100 Roma (RM) [TODO]',
  },

  address: {
    street: 'Via Esempio 1', // TODO
    postalCode: '00100',
    city: 'Roma',
    province: 'RM',
    country: 'Italia',
    countryCode: 'IT',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Via+Esempio+1+Roma', // TODO
    latitude: 41.9028,
    longitude: 12.4964,
  },

  contact: {
    phone: '+39 06 0000 0000', // TODO
    phoneHref: 'tel:+390600000000',
    /** Public contact address shown on the site. */
    email: 'info@example.it', // TODO
    /** Where new-order alerts go by default (the admin can change it in settings). */
    orderNotificationEmail: 'ordini@example.it', // TODO
  },

  social: {
    instagram: 'https://www.instagram.com/', // TODO
    facebook: 'https://www.facebook.com/', // TODO
  },

  locale: 'it-IT',
  timezone: 'Europe/Rome',
  currency: 'EUR',

  /** Seed values for the editable settings (see the note above). */
  defaults: {
    hours,
    prepMinutes: 20,
    slotMinutes: 15,
    /** Max pizzas the oven can take per 15-minute slot. */
    slotCapacity: 8,
    /** 0 = same day only. */
    maxDaysAhead: 2,
    /** How long an unpaid order holds its slot. */
    pendingHoldMinutes: 15,
  },

  brand: {
    logo: '/brand/logo.svg',
    /**
     * Deep charcoal, tomato red, basil green, cream (+ a touch of olive-oil gold).
     * Text colours on the dark background use the lighter 300/400 tones to keep WCAG AA contrast.
     */
    colors: {
      charcoal: { 950: '#0e0c0b', 900: '#151211', 800: '#1e1917', 700: '#2a2321', 600: '#3a302c', 500: '#52453f' },
      cream: { 50: '#fffbf3', 100: '#f7efe0', 200: '#ebddc4', 300: '#d8c5a2', 400: '#b9a27c' },
      tomato: { 300: '#ff9a83', 400: '#f26e52', 500: '#d9432b', 600: '#c2351f', 700: '#9e2a18' },
      basil: { 300: '#9ccb93', 400: '#7db474', 500: '#4e8f55', 600: '#3a7344', 700: '#2b5733' },
      gold: { 400: '#e2bc6a', 500: '#c9a24b' },
    },
  },
} as const;

export type Business = typeof business;

/** CSS custom properties for the whole palette, e.g. `--brand-tomato-600: #c2351f`. Injected in the root layout. */
export function brandCssVariables(): string {
  const lines: string[] = [];
  for (const [family, shades] of Object.entries(business.brand.colors)) {
    for (const [shade, value] of Object.entries(shades)) lines.push(`--brand-${family}-${shade}:${value};`);
  }
  return `:root{${lines.join('')}}`;
}
