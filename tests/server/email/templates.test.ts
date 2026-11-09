import { describe, expect, it } from 'vitest';
import { business } from '@/config/business';
import type { PizzaSnapshot } from '@/domain/pricing';
import { escapeHtml } from '@/server/email/html';
import { renderCustomerReceipt, renderPizzeriaAlert } from '@/server/email/templates';
import type { OrderEmailData } from '@/server/email/types';
import { SAMPLE_CART, itemsFromCart, makeOrder, visibleText } from './helpers';

const NOW = new Date('2026-11-08T16:00:00Z'); // 17:00 in Rome, a Sunday
const APP_URL = 'https://pizza.example';
const options = { now: NOW, appUrl: APP_URL };

const XSS = '<img src=x onerror=alert(1)>';
const SCRIPT = '<script>alert(1)</script>';
const ESCAPED_XSS = '&lt;img src=x onerror=alert(1)&gt;';

/** Three pizzas, as in the example subject of the brief. */
const THREE_PIZZAS = SAMPLE_CART.slice(0, 2);

describe('renderCustomerReceipt: subject', () => {
  it('names the order and says when to collect it', () => {
    expect(renderCustomerReceipt(makeOrder(), options).subject).toBe('Ordine n. 1234 confermato: ritiro oggi alle 19:30');
  });

  it('says "domani" and uses weekday and date further out', () => {
    const tomorrow = makeOrder({ pickupAt: new Date('2026-11-09T18:30:00Z') });
    expect(renderCustomerReceipt(tomorrow, options).subject).toBe('Ordine n. 1234 confermato: ritiro domani alle 19:30');
    const later = makeOrder({ pickupAt: new Date('2026-11-10T18:30:00Z') });
    expect(renderCustomerReceipt(later, options).subject).toBe('Ordine n. 1234 confermato: ritiro martedì 10 novembre alle 19:30');
  });

  it('does not contain anything the customer typed', () => {
    const hostile = makeOrder({ customerName: `${XSS}\r\nBcc: x@evil.test`, notes: SCRIPT });
    expect(renderCustomerReceipt(hostile, options).subject).toBe('Ordine n. 1234 confermato: ritiro oggi alle 19:30');
  });
});

describe('renderCustomerReceipt: content', () => {
  const order = makeOrder({ totalCents: 3250, notes: 'Citofono rotto, chiamare' });
  const { html, text } = renderCustomerReceipt(order, options);
  const seen = visibleText(html);

  it('greets the customer by first name and confirms the payment', () => {
    expect(seen).toContain('Ciao Mario,');
    expect(text).toContain('Ciao Mario,');
    expect(seen).toContain('Pagato online');
    expect(text).toContain('Pagato online');
  });

  it('shows the pickup time big, with the day, the date and the order number', () => {
    expect(html).toMatch(/font-size:(5\d|6\d|7\d)px;[^"]*">\s*19:30\s*</);
    expect(seen).toContain('Ritiro oggi');
    expect(seen).toContain('Domenica 8 novembre');
    expect(seen).toContain('Ordine n. 1234');
    expect(text).toContain('RITIRO OGGI ALLE 19:30');
    expect(text).toContain('Ordine n. 1234');
  });

  it('lists every item with quantity, price and the full build', () => {
    for (const haystack of [seen, text]) {
      expect(haystack).toContain('2 × Diavola');
      expect(haystack).toContain('Media (30 cm), impasto: Integrale, salsa: Rossa');
      expect(haystack).toContain('Mozzarella ×2 (+1 extra)');
      expect(haystack).toContain('Funghi (extra)');
      expect(haystack).toContain('Senza: Basilico');
      expect(haystack).toContain('Basilico (dopo cottura)');
      expect(haystack).toContain('2 × Cola 33cl');
      expect(haystack).toContain('24,40 €');
      expect(haystack).toContain('Nota: ben cotta');
    }
  });

  it('shows allergens per item and once for the whole order', () => {
    for (const haystack of [seen, text]) {
      expect(haystack).toContain('Allergeni: Glutine, Latte');
      expect(haystack).toContain('Allergeni presenti nell’ordine: Glutine, Pesce, Latte');
    }
  });

  it('states the total with IVA inclusa', () => {
    for (const haystack of [seen, text]) {
      expect(haystack).toContain('32,50 €');
      expect(haystack).toContain('IVA inclusa');
    }
  });

  it('echoes the notes the customer left', () => {
    expect(seen).toContain('Citofono rotto, chiamare');
    expect(text).toContain('Citofono rotto, chiamare');
  });

  it('gives the shop address, a phone link and a maps link', () => {
    const { address, contact } = business;
    for (const haystack of [seen, text]) {
      expect(haystack).toContain(business.name);
      expect(haystack).toContain(`${address.street}, ${address.postalCode} ${address.city} (${address.province})`);
      expect(haystack).toContain(contact.phone);
    }
    expect(html).toContain(`href="${contact.phoneHref}"`);
    expect(html).toContain(`href="${escapeHtml(address.mapsUrl)}"`); // "&" in the query string is written as &amp; in HTML
    expect(text).toContain(address.mapsUrl);
  });

  it('links to the live status page', () => {
    const url = `${APP_URL}/ordine/tok_AbC123xyz`;
    expect(html).toContain(`href="${url}"`);
    expect(text).toContain(url);
  });

  it('warns that this is not a fiscal receipt and carries the legal data', () => {
    for (const haystack of [seen, text]) {
      expect(haystack).toContain('Questa email non è una ricevuta fiscale. [TODO: testo legale/fiscale]');
      expect(haystack).toContain(business.legal.companyName);
      expect(haystack).toContain(business.legal.vatNumber);
    }
  });

  it('shows a clear sentence when the order declares no allergen', () => {
    const drinks = makeOrder({}, [{ type: 'product', slug: 'cola', quantity: 1 }]);
    const out = renderCustomerReceipt(drinks, options);
    expect(visibleText(out.html)).toContain('Nessun allergene dichiarato');
    expect(out.text).toContain('Nessun allergene dichiarato');
  });

  it('copes with a customer who left no name', () => {
    const out = renderCustomerReceipt(makeOrder({ customerName: '  ' }), options);
    expect(visibleText(out.html)).toContain('Ciao,');
    expect(out.text).toContain('Ciao,');
  });
});

describe('renderCustomerReceipt: HTML is email-safe', () => {
  const { html } = renderCustomerReceipt(makeOrder(), options);

  it('is a complete Italian document, 600px wide, table based, with no script', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="it"');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);
  });

  it('uses the brand colours inline and adapts to dark mode', () => {
    const { cream, charcoal, tomato } = business.brand.colors;
    expect(html).toContain(cream[50]);
    expect(html).toContain(charcoal[900]);
    expect(html).toContain(tomato[600]);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
  });

  it('has a preheader and a title', () => {
    expect(html).toMatch(/<title>[^<]*1234[^<]*<\/title>/);
    expect(html).toContain('display:none');
    expect(html).toMatch(/Ritiro oggi alle 19:30/);
  });

  it('only links to web, phone or mail addresses', () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(2);
    for (const href of hrefs) expect(href).toMatch(/^(https?:\/\/|tel:|mailto:)/);
  });
});

describe('renderCustomerReceipt: escaping', () => {
  const hostile = makeOrder({
    customerName: XSS,
    customerPhone: XSS,
    notes: `${XSS} ${SCRIPT}`,
    items: itemsFromCart(SAMPLE_CART).map((item, index) =>
      index === 0
        ? {
            ...item,
            name: `Diavola ${XSS}`,
            notes: SCRIPT,
            config: {
              ...(item.config as PizzaSnapshot),
              ingredients: (item.config as PizzaSnapshot).ingredients.map((i) => ({ ...i, name: `${i.name} ${XSS}` })),
            },
          }
        : item,
    ),
  });
  const { html, text } = renderCustomerReceipt(hostile, options);

  it('never lets customer-controlled markup through', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/onerror=alert\(1\)>/);
    expect(html).toContain(ESCAPED_XSS);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('leaves the plain-text part verbatim (it is not HTML)', () => {
    expect(text).toContain(`Diavola ${XSS}`);
  });
});

describe('renderPizzeriaAlert: subject', () => {
  const three = makeOrder({ totalCents: 3250 }, THREE_PIZZAS);

  it('gives pickup time, pizza count and total at a glance', () => {
    expect(renderPizzeriaAlert(three, options).subject).toBe('Nuovo ordine n. 1234: ritiro 19:30, 3 pizze, 32,50 €');
  });

  it('adds the day when it is not today', () => {
    const tomorrow = makeOrder({ totalCents: 3250, pickupAt: new Date('2026-11-09T18:30:00Z') }, THREE_PIZZAS);
    expect(renderPizzeriaAlert(tomorrow, options).subject).toBe('Nuovo ordine n. 1234: ritiro domani 19:30, 3 pizze, 32,50 €');
    const later = makeOrder({ totalCents: 3250, pickupAt: new Date('2026-11-10T18:30:00Z') }, THREE_PIZZAS);
    expect(renderPizzeriaAlert(later, options).subject).toBe('Nuovo ordine n. 1234: ritiro martedì 10 novembre 19:30, 3 pizze, 32,50 €');
  });

  it('uses the singular, and says so when there is no pizza', () => {
    const one = makeOrder({ totalCents: 850 }, [SAMPLE_CART[1]!]);
    expect(renderPizzeriaAlert(one, options).subject).toBe('Nuovo ordine n. 1234: ritiro 19:30, 1 pizza, 8,50 €');
    const none = makeOrder({ totalCents: 250 }, [{ type: 'product', slug: 'cola', quantity: 1 }]);
    expect(renderPizzeriaAlert(none, options).subject).toBe('Nuovo ordine n. 1234: ritiro 19:30, nessuna pizza, 2,50 €');
  });
});

describe('renderPizzeriaAlert: kitchen ticket', () => {
  const order = makeOrder({ totalCents: 3250, notes: 'Senza cipolla, grazie!\nSuono al citofono "Rossi"' });
  const { html, text } = renderPizzeriaAlert(order, options);
  const seen = visibleText(html);

  it('puts the pickup time first and huge', () => {
    expect(html).toMatch(/font-size:(7\d|8\d|9\d)px;[^"]*">\s*19:30\s*</);
    expect(seen).toContain('Oggi');
    expect(seen).toContain('domenica 8 novembre');
    expect(seen).toContain('Ordine n. 1234');
    expect(text.split('\n').slice(0, 4).join('\n')).toContain('RITIRO oggi alle 19:30');
  });

  it('shows who is coming, with a phone link', () => {
    expect(seen).toContain('Mario Rossi');
    expect(seen).toContain('+39 333 123 4567');
    expect(html).toContain('href="tel:+393331234567"');
    expect(text).toContain('Mario Rossi');
    expect(text).toContain('+39 333 123 4567');
  });

  it('marks the order as paid', () => {
    expect(seen).toContain('PAGATO');
    expect(text).toContain('PAGATO');
    expect(seen).toContain('32,50 €');
    expect(seen).toContain('4 pizze');
  });

  it('spells out every pizza: build, each ingredient with its portions, extras, removed, after-bake', () => {
    for (const haystack of [seen, text]) {
      expect(haystack).toContain('Diavola');
      expect(haystack).toContain('Media (30 cm), impasto: Integrale, salsa: Rossa');
      expect(haystack).toContain('Mozzarella ×2 (+1 extra)');
      expect(haystack).toContain('Salame piccante');
      expect(haystack).toContain('Funghi (extra)');
      expect(haystack).toContain('Senza: Basilico');
      expect(haystack).toContain('Basilico (dopo cottura)');
    }
  });

  it('flags a changed classic pizza as such', () => {
    expect(seen).toContain('Diavola (modificata)');
    expect(text).toContain('Diavola (modificata)');
  });

  it('shows the customer notes in their own highlighted box, line breaks kept', () => {
    const label = html.indexOf('Note del cliente');
    expect(label).toBeGreaterThan(-1);
    const box = html.slice(label, label + 900);
    expect(box).toContain('Senza cipolla, grazie!<br>Suono al citofono &quot;Rossi&quot;');
    expect(text).toContain('NOTE DEL CLIENTE');
    expect(text).toContain('Senza cipolla, grazie!');
  });

  it('shows the per-item note', () => {
    expect(seen).toContain('Nota: ben cotta');
    expect(text).toContain('Nota: ben cotta');
  });

  it('warns about allergens in bold, per item and for the whole order', () => {
    expect(html).toMatch(/<strong[^>]*>\s*Allergeni:?\s*Glutine, Latte\s*<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>\s*Allergeni nell’ordine:?\s*Glutine, Pesce, Latte\s*<\/strong>/);
    expect(text).toContain('ALLERGENI: Glutine, Latte');
    expect(text).toContain('ALLERGENI NELL’ORDINE: Glutine, Pesce, Latte');
  });

  it('links to the order in the admin', () => {
    const url = `${APP_URL}/admin/ordini/${order.id}`;
    expect(html).toContain(`href="${url}"`);
    expect(text).toContain(url);
  });

  it('omits the notes box when there are no notes', () => {
    const quiet = renderPizzeriaAlert(makeOrder({ notes: null }), options);
    expect(quiet.html).not.toContain('Note del cliente');
    expect(quiet.text).not.toContain('NOTE DEL CLIENTE');
  });

  it('is email-safe: complete document, 600px, no script, dark mode', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('max-width:600px');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('prefers-color-scheme: dark');
  });
});

describe('renderPizzeriaAlert: escaping', () => {
  const hostile: OrderEmailData = makeOrder({
    customerName: XSS,
    customerPhone: `+39 333 ${XSS}`,
    notes: `${XSS}\n${SCRIPT}`,
    items: itemsFromCart(SAMPLE_CART).map((item, index) =>
      index === 0 ? { ...item, name: `Diavola ${XSS}`, notes: SCRIPT } : item,
    ),
  });
  const { html, text } = renderPizzeriaAlert(hostile, options);

  it('never lets customer-controlled markup through', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/onerror=alert\(1\)>/);
    expect(html).toContain(ESCAPED_XSS);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('builds the phone link from digits only', () => {
    // "+39 333 <img src=x onerror=alert(1)>" -> the only digits are 39, 333 and the 1 of alert(1)
    expect(html).toContain('href="tel:+393331"');
  });

  it('keeps the subject free of customer text', () => {
    expect(renderPizzeriaAlert(hostile, options).subject).toMatch(/^Nuovo ordine n\. 1234: ritiro 19:30, \d+ pizze, [\d,]+ €$/);
  });

  it('keeps the plain text readable and verbatim', () => {
    expect(text).toContain(`Diavola ${XSS}`);
  });
});
