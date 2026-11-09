import { z } from 'zod';
import { cartSchema } from '@/domain/cart';

/**
 * What the browser POSTs to /api/checkout. Carries NO prices except `expectedTotalCents`, the total the customer
 * saw; the server re-prices the cart and refuses to charge anything else.
 */

/**
 * Loose Italian / international phone normalisation:
 * strips spaces, dots, dashes, slashes and parentheses; "00" → "+"; a bare number starting with 3 (mobile) or 0
 * (landline) gets "+39".
 */
export function normalizePhone(raw: string): string {
  let phone = raw.trim().replace(/[\s.\-/()]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (/^[03]/.test(phone)) phone = `+39${phone}`;
  return phone;
}

const phoneSchema = z
  .string({ error: 'Inserisci il numero di telefono.' })
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .min(8, 'Inserisci un numero di telefono valido.')
      .max(20, 'Inserisci un numero di telefono valido.')
      .regex(/^\+?\d+$/, 'Inserisci un numero di telefono valido.'),
  );

export const checkoutInputSchema = z.object({
  clientRequestId: z.uuid('Richiesta non valida: ricarica la pagina e riprova.'),
  customer: z.object(
    {
      name: z
        .string({ error: 'Inserisci il tuo nome.' })
        .trim()
        .min(2, 'Inserisci il tuo nome (almeno 2 caratteri).')
        .max(80, 'Il nome può avere al massimo 80 caratteri.'),
      phone: phoneSchema,
      email: z
        .string({ error: 'Inserisci un indirizzo email valido.' })
        .trim()
        .toLowerCase()
        .pipe(z.email('Inserisci un indirizzo email valido.')),
    },
    { error: 'Inserisci i tuoi dati.' },
  ),
  /** Slot start as ISO-8601 (the `startIso` from /api/slots). */
  pickupAt: z.iso.datetime({ offset: true, error: "Scegli un orario di ritiro valido." }),
  notes: z
    .string('Note non valide.')
    .trim()
    .max(300, 'Le note possono avere al massimo 300 caratteri.')
    .transform((v) => (v ? v : undefined))
    .optional(),
  acceptTerms: z.literal(true, 'Devi accettare le condizioni di vendita per procedere.'),
  expectedTotalCents: z.int('Totale non valido.').min(0, 'Totale non valido.'),
  cart: cartSchema,
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

/**
 * Flattens Zod issues into `{ "customer.email": "Inserisci..." }` (first message per path wins).
 * Errors on the whole cart (e.g. empty) are reported under "cart".
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!(path in fields)) fields[path] = italianMessage(issue, path);
  }
  return fields;
}

/** Zod's default English messages are replaced for the paths whose schemas we do not own (the cart). */
function italianMessage(issue: z.core.$ZodIssue, path: string): string {
  if (path === 'cart' || path.startsWith('cart.')) {
    if (path === 'cart' && issue.code === 'too_small') return 'Il carrello è vuoto.';
    if (path === 'cart' && issue.code === 'too_big') return 'Il carrello contiene troppi prodotti.';
    return 'Il carrello contiene una scelta non valida.';
  }
  return issue.message;
}
