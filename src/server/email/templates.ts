import { business } from '@/config/business';
import { capitalize, describePickup, firstName, formatMoney, oneLine, phoneHref, pizzasLabel, type PickupInfo } from './format';
import { type SafeHtml, html, nl2br, raw, safeHref } from './html';
import type { OrderEmailData, RenderedEmail } from './types';
import { buildOrderView, type ItemView, type OrderView } from './view';

export type { OrderEmailData, OrderEmailItem, RenderedEmail } from './types';

/**
 * The two emails of a paid order.
 *
 *  - `renderCustomerReceipt`: confirmation for the customer (what, when, where, how to follow it).
 *  - `renderPizzeriaAlert`: shaped like a kitchen ticket for the pizzeria.
 *
 * Both are pure: they take the order, the current time and the public origin of the site, and return
 * `{ subject, html, text }`. The HTML is table based with inline CSS (email clients ignore the rest), 600px wide,
 * and every interpolated value goes through the escaping `html` tag. The text part carries the same information.
 */

export interface RenderOptions {
  /** Instant of rendering: decides "oggi" / "domani". */
  now: Date;
  /** Public origin of the site, without trailing slash, e.g. "https://pizzeria.example". */
  appUrl: string;
}

// ───────────────────────────── design tokens (from the brand config) ─────────────────────────────

const { cream, charcoal, tomato, basil, gold } = business.brand.colors;

const light = {
  page: cream[50],
  card: '#ffffff',
  paper: cream[100],
  line: cream[200],
  ink: charcoal[900],
  muted: charcoal[500],
  accent: tomato[600],
  accentSoft: tomato[600],
  ok: basil[600],
  onFill: cream[50],
  noteBg: '#fff2c9',
  noteBorder: gold[500],
  alertBg: '#fde9e4',
} as const;

const dark = {
  page: charcoal[900],
  card: charcoal[800],
  paper: charcoal[700],
  line: charcoal[600],
  ink: cream[100],
  muted: cream[400],
  accent: tomato[400],
  ok: basil[300],
  noteBg: '#3d3214',
  noteBorder: gold[400],
  alertBg: '#3b1d17',
} as const;

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Dark-mode and small-screen overrides. Clients that ignore <style> still get the inline light theme. */
const STYLE_SHEET = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme: dark){
.pz-page{background:${dark.page} !important}
.pz-card{background:${dark.card} !important;border-color:${dark.line} !important}
.pz-paper{background:${dark.paper} !important}
.pz-line{border-color:${dark.line} !important}
.pz-ink{color:${dark.ink} !important}
.pz-muted{color:${dark.muted} !important}
.pz-accent{color:${dark.accent} !important}
.pz-ok{color:${dark.ok} !important}
.pz-note{background:${dark.noteBg} !important;border-color:${dark.noteBorder} !important;color:${dark.ink} !important}
.pz-alert{background:${dark.alertBg} !important;border-color:${dark.accent} !important;color:${dark.ink} !important}
.pz-ink a,.pz-muted a{color:${dark.accent} !important}
}
@media (max-width:620px){
.pz-pad{padding-left:20px !important;padding-right:20px !important}
.pz-time{font-size:56px !important}
.pz-time-xl{font-size:72px !important}
.pz-title{font-size:22px !important}
}`;

// ───────────────────────────── shared building blocks ─────────────────────────────

const font = (family: string) => raw(family);

function shell(input: { title: string; preheader: string; body: SafeHtml }): string {
  const filler = raw('&#847;&zwnj;&nbsp;'.repeat(40));
  return html`<!doctype html>
<html lang="it" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${input.title}</title>
<style>${raw(STYLE_SHEET)}</style>
</head>
<body class="pz-page" style="margin:0;padding:0;background:${light.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${light.page}">${input.preheader}${filler}</div>
<table role="presentation" class="pz-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${light.page}" style="background:${light.page}">
<tr><td align="center" style="padding:24px 12px">
${raw('<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
${input.body}
</table>
${raw('<!--[if mso]></td></tr></table><![endif]-->')}
</td></tr>
</table>
</body>
</html>`.toString();
}

function brandHeader(): SafeHtml {
  return html`<tr><td class="pz-pad" style="padding:4px 8px 16px">
<span class="pz-accent" style="font-family:${font(SERIF)};font-size:24px;line-height:1.2;font-weight:700;color:${light.accent}">${business.name}</span>
</td></tr>`;
}

/** Paragraph-sized text in the body font. */
function para(content: unknown, extra = ''): SafeHtml {
  return html`<p class="pz-ink" style="margin:0 0 12px;font-family:${font(SANS)};font-size:16px;line-height:1.55;color:${light.ink};${raw(extra)}">${content}</p>`;
}

function heading(text: string): SafeHtml {
  return html`<div class="pz-ink" style="margin:0 0 10px;font-family:${font(SERIF)};font-size:21px;line-height:1.25;font-weight:700;color:${light.ink}">${text}</div>`;
}

/** A call-to-action button that survives Outlook (padding lives on the link inside a filled cell). */
function button(href: string, label: string): SafeHtml {
  return html`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${light.accent}" style="background:${light.accent};border-radius:999px"><a href="${safeHref(href)}" style="display:inline-block;padding:14px 28px;font-family:${font(SANS)};font-size:16px;font-weight:700;line-height:1.2;color:${light.onFill};text-decoration:none">${label}</a></td>
</tr></table>`;
}

function chip(label: string): SafeHtml {
  return html`<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${light.ok};font-family:${font(SANS)};font-size:14px;font-weight:700;line-height:1.4;color:${light.onFill}">${label}</span>`;
}

/** The white card that holds the main content. `joined` squares the top corners when a header band sits right above. */
function card(rows: SafeHtml[], options: { joined?: boolean } = {}): SafeHtml {
  const radius = options.joined ? '0 0 16px 16px' : '16px';
  return html`<tr><td>
<table role="presentation" class="pz-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${light.card}" style="background:${light.card};border:1px solid ${light.line};border-radius:${radius}">
${rows}
</table>
</td></tr>`;
}

function section(content: SafeHtml, padding = '8px 32px 20px'): SafeHtml {
  return html`<tr><td class="pz-pad" style="padding:${padding}">${content}</td></tr>`;
}

function legalFooter(): SafeHtml {
  const { legal, contact } = business;
  const small = `margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.6;`;
  return html`<tr><td class="pz-pad" style="padding:20px 8px 0">
<p class="pz-muted" style="${raw(small)}color:${light.muted}">Questa email non è una ricevuta fiscale. [TODO: testo legale/fiscale]</p>
<p class="pz-muted" style="${raw(small)}color:${light.muted}">${legal.companyName}<br>${legal.vatNumber}<br>${legal.reaNumber}<br>Sede legale: ${legal.registeredOffice}<br>PEC: ${legal.pec}</p>
<p class="pz-muted" style="${raw(small)}color:${light.muted}">Domande sull’ordine? Scrivici a <a href="${safeHref(`mailto:${contact.email}`)}" style="color:${light.accent}">${contact.email}</a> o chiamaci al <a href="${safeHref(contact.phoneHref)}" style="color:${light.accent}">${contact.phone}</a>.</p>
</td></tr>`;
}

const addressLine = (): string => {
  const { address } = business;
  return `${address.street}, ${address.postalCode} ${address.city} (${address.province})`;
};

const publicUrl = (options: RenderOptions, path: string): string => `${options.appUrl}${path}`;

/** Weekday and date for the big pickup box: "Oggi, domenica 8 novembre", "Martedì 10 novembre". */
function pickupHeadline(pickup: PickupInfo): string {
  return pickup.dayWord === 'oggi' || pickup.dayWord === 'domani'
    ? `${capitalize(pickup.dayWord)}, ${pickup.weekdayDate}`
    : capitalize(pickup.weekdayDate);
}

// ───────────────────────────── customer receipt ─────────────────────────────

function receiptItem(item: ItemView): SafeHtml {
  const detail = (content: unknown) =>
    html`<div class="pz-muted" style="margin-top:3px;font-family:${font(SANS)};font-size:14px;line-height:1.5;color:${light.muted}">${content}</div>`;
  return html`<tr><td class="pz-line" style="padding:12px 0;border-top:1px solid ${light.line}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="44" class="pz-ink" style="font-family:${font(SANS)};font-size:16px;line-height:1.4;font-weight:700;white-space:nowrap;color:${light.ink}">${item.quantity} ×</td>
<td valign="top" class="pz-ink" style="font-family:${font(SANS)};font-size:16px;line-height:1.4;color:${light.ink}">
<div style="font-weight:700">${item.name}${item.modified ? html` <span class="pz-accent" style="font-weight:600;color:${light.accent}">(modificata)</span>` : ''}</div>
${item.build ? detail(item.build) : ''}
${item.ingredients.length > 0 ? detail(`Ingredienti: ${item.ingredients.map((i) => i.text).join(', ')}`) : ''}
${item.removed.length > 0 ? detail(`Senza: ${item.removed.join(', ')}`) : ''}
${item.notes ? detail(`Nota: ${item.notes}`) : ''}
${item.allergens.length > 0 ? detail(`Allergeni: ${item.allergens.join(', ')}`) : ''}
</td>
<td valign="top" align="right" class="pz-ink" style="padding-left:12px;font-family:${font(SANS)};font-size:16px;line-height:1.4;font-weight:600;white-space:nowrap;color:${light.ink}">${item.lineTotal}${
    item.quantity > 1 ? html`<div class="pz-muted" style="font-size:13px;font-weight:400;color:${light.muted}">${item.unitPrice} cad.</div>` : ''
  }</td>
</tr></table>
</td></tr>`;
}

function allergenSummary(view: OrderView): string {
  return view.allergens.length > 0 ? `Allergeni presenti nell’ordine: ${view.allergens.join(', ')}` : 'Nessun allergene dichiarato nell’ordine.';
}

const ALLERGEN_TRACES = 'In cucina possono essere presenti tracce di altri allergeni.';

export function renderCustomerReceipt(order: OrderEmailData, options: RenderOptions): RenderedEmail {
  const pickup = describePickup(order.pickupAt, options.now);
  const view = buildOrderView(order);
  const name = firstName(order.customerName);
  const greeting = name ? `Ciao ${name},` : 'Ciao,';
  const statusUrl = publicUrl(options, `/ordine/${encodeURIComponent(order.publicToken)}`);
  const { address, contact } = business;
  const notes = order.notes?.trim() || null;

  const subject = `Ordine n. ${order.number} confermato: ritiro ${pickup.dayWord} alle ${pickup.time}`;
  const preheader = `Ritiro ${pickup.dayWord} alle ${pickup.time}. Ordine n. ${order.number}.`;

  const body = html`
${brandHeader()}
${card([
  section(
    html`${para(greeting)}${para('il tuo ordine è confermato e pagato. Ti aspettiamo in pizzeria per il ritiro.', 'margin-bottom:0')}`,
    '32px 32px 16px',
  ),
  section(
    html`<table role="presentation" class="pz-paper" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${light.paper}" style="background:${light.paper};border-radius:12px"><tr>
<td align="center" style="padding:22px 16px">
<div class="pz-muted" style="font-family:${font(SANS)};font-size:15px;line-height:1.4;color:${light.muted}">Ritiro ${pickup.dayWord}</div>
<div class="pz-time pz-accent" style="font-family:${font(SERIF)};font-size:64px;line-height:1.1;font-weight:700;color:${light.accent}">${pickup.time}</div>
<div class="pz-ink" style="font-family:${font(SANS)};font-size:17px;line-height:1.4;font-weight:600;color:${light.ink}">${capitalize(pickup.weekdayDate)}</div>
<div class="pz-muted" style="margin-top:6px;font-family:${font(SANS)};font-size:15px;line-height:1.4;color:${light.muted}">Ordine n. ${order.number}</div>
</td></tr></table>`,
    '8px 32px 24px',
  ),
  section(
    html`${heading('Il tuo ordine')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${view.items.map(receiptItem)}</table>`,
    '0 32px 8px',
  ),
  section(
    html`<table role="presentation" class="pz-line" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${light.ink}"><tr>
<td class="pz-ink" style="padding-top:14px;font-family:${font(SANS)};font-size:18px;line-height:1.3;font-weight:700;color:${light.ink}">Totale <span class="pz-muted" style="font-size:13px;font-weight:400;color:${light.muted}">IVA inclusa</span></td>
<td align="right" class="pz-ink" style="padding-top:14px;font-family:${font(SERIF)};font-size:24px;line-height:1.2;font-weight:700;color:${light.ink}">${formatMoney(order.totalCents)}</td>
</tr><tr><td colspan="2" style="padding-top:10px">${chip('Pagato online')}</td></tr></table>`,
    '4px 32px 20px',
  ),
  section(
    html`<div class="pz-ink" style="font-family:${font(SANS)};font-size:15px;line-height:1.5;color:${light.ink}"><strong>${allergenSummary(view)}</strong></div>
<div class="pz-muted" style="margin-top:4px;font-family:${font(SANS)};font-size:13px;line-height:1.5;color:${light.muted}">${ALLERGEN_TRACES} Se hai un’allergia grave, chiamaci al ${contact.phone}.</div>`,
    '0 32px 20px',
  ),
  notes
    ? section(
        html`${heading('Le tue note')}<div class="pz-note" style="padding:10px 14px;border-left:4px solid ${light.noteBorder};background:${light.noteBg};font-family:${font(SANS)};font-size:15px;line-height:1.5;color:${light.ink}">${nl2br(notes)}</div>`,
        '0 32px 20px',
      )
    : html``,
  section(
    html`${heading('Dove ritirare')}
<div class="pz-ink" style="font-family:${font(SANS)};font-size:16px;line-height:1.55;color:${light.ink}"><strong>${business.name}</strong><br>${addressLine()}<br>Tel. <a href="${safeHref(contact.phoneHref)}" style="color:${light.accent}">${contact.phone}</a><br><a href="${safeHref(address.mapsUrl)}" style="color:${light.accent}">Apri su Google Maps</a></div>`,
    '0 32px 24px',
  ),
  section(
    html`${heading('Segui l’ordine in tempo reale')}
${para('Aggiorniamo questa pagina man mano che la pizza viene preparata.', 'font-size:15px')}
${button(statusUrl, 'Segui il tuo ordine')}
<div class="pz-muted" style="margin-top:12px;font-family:${font(SANS)};font-size:13px;line-height:1.5;color:${light.muted};word-break:break-all"><a href="${safeHref(statusUrl)}" style="color:${light.accent}">${statusUrl}</a></div>`,
    '0 32px 32px',
  ),
])}
${legalFooter()}`;

  const text = [
    greeting,
    '',
    'il tuo ordine è confermato e pagato. Ti aspettiamo in pizzeria per il ritiro.',
    '',
    `RITIRO ${pickup.dayWord.toUpperCase()} ALLE ${pickup.time}`,
    capitalize(pickup.weekdayDate),
    `Ordine n. ${order.number}`,
    '',
    'IL TUO ORDINE',
    ...view.items.flatMap((item) => itemTextLines(item, 'receipt')),
    '',
    `Totale: ${formatMoney(order.totalCents)} (IVA inclusa)`,
    'Pagato online',
    '',
    allergenSummary(view),
    `${ALLERGEN_TRACES} Se hai un’allergia grave, chiamaci al ${contact.phone}.`,
    ...(notes ? ['', 'LE TUE NOTE', ...notes.split(/\r\n|\r|\n/)] : []),
    '',
    'DOVE RITIRARE',
    business.name,
    addressLine(),
    `Tel. ${contact.phone}`,
    `Mappa: ${address.mapsUrl}`,
    '',
    'SEGUI IL TUO ORDINE',
    statusUrl,
    '',
    '--',
    'Questa email non è una ricevuta fiscale. [TODO: testo legale/fiscale]',
    business.legal.companyName,
    business.legal.vatNumber,
    business.legal.reaNumber,
    `Sede legale: ${business.legal.registeredOffice}`,
    `PEC: ${business.legal.pec}`,
    `Domande sull’ordine? Scrivici a ${contact.email} o chiamaci al ${contact.phone}.`,
  ].join('\n');

  return { subject, html: shell({ title: `Ordine n. ${order.number} confermato`, preheader, body }), text };
}

// ───────────────────────────── pizzeria alert (kitchen ticket) ─────────────────────────────

/** Plain-text lines for one order line, shared by both emails. */
function itemTextLines(item: ItemView, mode: 'receipt' | 'ticket'): string[] {
  const loud = mode === 'ticket';
  const title = `${item.quantity} × ${oneLine(item.name)}${item.modified ? ' (modificata)' : ''}`;
  const price = loud ? '' : `: ${item.lineTotal}${item.quantity > 1 ? ` (${item.unitPrice} cad.)` : ''}`;
  const indent = (value: string) => `   ${value}`;
  const multiline = (label: string, value: string) => {
    const [first = '', ...rest] = value.split(/\r\n|\r|\n/);
    return [indent(`${label}: ${first}`), ...rest.map((line) => indent(line))];
  };

  const lines = [`${title}${price}`];
  if (item.build) lines.push(indent(item.build));
  if (item.ingredients.length > 0) {
    if (loud) lines.push(...item.ingredients.map((i) => indent(`- ${i.text}`)));
    else lines.push(indent(`Ingredienti: ${item.ingredients.map((i) => i.text).join(', ')}`));
  }
  if (item.removed.length > 0) lines.push(indent(`Senza: ${item.removed.join(', ')}`));
  if (item.notes) lines.push(...multiline('Nota', item.notes));
  if (item.allergens.length > 0) lines.push(indent(`${loud ? 'ALLERGENI' : 'Allergeni'}: ${item.allergens.join(', ')}`));
  return lines;
}

function ticketItem(item: ItemView): SafeHtml {
  const line = (content: unknown, extra = '') =>
    html`<div class="pz-ink" style="margin-top:3px;font-family:${font(SANS)};font-size:17px;line-height:1.4;color:${light.ink};${raw(extra)}">${content}</div>`;
  return html`<tr><td style="padding:0 0 12px">
<table role="presentation" class="pz-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${light.card}" style="background:${light.card};border:2px solid ${light.ink};border-radius:12px"><tr>
<td valign="top" width="64" class="pz-ink" style="padding:14px 0 14px 16px;font-family:${font(SERIF)};font-size:32px;line-height:1.1;font-weight:700;white-space:nowrap;color:${light.ink}">${item.quantity}×</td>
<td valign="top" style="padding:14px 16px 14px 8px">
<div class="pz-ink" style="font-family:${font(SANS)};font-size:22px;line-height:1.25;font-weight:700;color:${light.ink}">${item.name}${item.modified ? html` <span class="pz-accent" style="font-size:16px;color:${light.accent}">(modificata)</span>` : ''}</div>
${item.build ? html`<div class="pz-muted" style="margin-top:2px;font-family:${font(SANS)};font-size:15px;line-height:1.4;color:${light.muted}">${item.build}</div>` : ''}
${item.ingredients.map((i) => line(html`•&nbsp;${i.text}`, i.extra ? 'font-weight:700;' : ''))}
${item.removed.length > 0 ? line(`Senza: ${item.removed.join(', ')}`, `font-weight:700;color:${light.accent};`) : ''}
${item.notes ? html`<div class="pz-note" style="margin-top:8px;padding:8px 12px;border-left:4px solid ${light.noteBorder};background:${light.noteBg};font-family:${font(SANS)};font-size:16px;line-height:1.4;color:${light.ink}"><strong>Nota:</strong> ${nl2br(item.notes)}</div>` : ''}
${item.allergens.length > 0 ? html`<div class="pz-ink" style="margin-top:8px;font-family:${font(SANS)};font-size:16px;line-height:1.4;color:${light.ink}"><strong>Allergeni: ${item.allergens.join(', ')}</strong></div>` : ''}
</td>
</tr></table>
</td></tr>`;
}

export function renderPizzeriaAlert(order: OrderEmailData, options: RenderOptions): RenderedEmail {
  const pickup = describePickup(order.pickupAt, options.now);
  const view = buildOrderView(order);
  const orderUrl = publicUrl(options, `/admin/ordini/${encodeURIComponent(order.id)}`);
  const notes = order.notes?.trim() || null;
  const customerName = oneLine(order.customerName);
  const customerPhone = oneLine(order.customerPhone);
  const telHref = phoneHref(order.customerPhone);
  const total = formatMoney(order.totalCents);
  const summary = `${pizzasLabel(view.pizzaCount)}, ${total}`;

  const when = pickup.isToday ? pickup.time : `${pickup.dayWord} ${pickup.time}`;
  const subject = `Nuovo ordine n. ${order.number}: ritiro ${when}, ${summary}`;
  const preheader = `Ritiro ${pickup.isToday ? '' : `${pickup.dayWord} `}${pickup.time}, ${summary}. ${customerName}.`;

  const bodyFont = font(SANS);
  const body = html`
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${charcoal[900]}" style="background:${charcoal[900]};border-radius:16px 16px 0 0"><tr>
<td class="pz-pad" style="padding:18px 28px">
<div style="font-family:${bodyFont};font-size:14px;line-height:1.4;color:${cream[400]}">Nuovo ordine dal sito</div>
<div class="pz-title" style="font-family:${font(SERIF)};font-size:28px;line-height:1.2;font-weight:700;color:${cream[100]}">Ordine n. ${order.number}</div>
</td>
<td class="pz-pad" align="right" valign="middle" style="padding:18px 28px">${chip('PAGATO')}</td>
</tr></table>
</td></tr>
${card([
  section(
    html`<div class="pz-muted" style="font-family:${bodyFont};font-size:15px;line-height:1.4;color:${light.muted}">Ritiro</div>
<div class="pz-time-xl pz-accent" style="font-family:${font(SERIF)};font-size:88px;line-height:1.05;font-weight:700;color:${light.accent}">${pickup.time}</div>
<div class="pz-ink" style="font-family:${bodyFont};font-size:20px;line-height:1.4;font-weight:700;color:${light.ink}">${pickupHeadline(pickup)}</div>
<div class="pz-muted" style="margin-top:4px;font-family:${bodyFont};font-size:16px;line-height:1.4;color:${light.muted}">${summary}</div>`,
    '24px 28px 16px',
  ),
  section(
    html`<div class="pz-muted" style="font-family:${bodyFont};font-size:14px;line-height:1.4;color:${light.muted}">Cliente</div>
<div class="pz-ink" style="font-family:${bodyFont};font-size:24px;line-height:1.3;font-weight:700;color:${light.ink}">${customerName}</div>
<div class="pz-ink" style="font-family:${bodyFont};font-size:20px;line-height:1.4;color:${light.ink}">${telHref ? html`<a href="${safeHref(telHref)}" style="color:${light.accent}">${customerPhone}</a>` : customerPhone}</div>`,
    '8px 28px 16px',
  ),
  notes
    ? section(
        html`<div class="pz-note" style="padding:12px 16px;border-left:6px solid ${light.noteBorder};background:${light.noteBg};font-family:${bodyFont};color:${light.ink}">
<div style="font-size:14px;line-height:1.4;font-weight:700">Note del cliente</div>
<div style="margin-top:4px;font-size:19px;line-height:1.45">${nl2br(notes)}</div>
</div>`,
        '0 28px 16px',
      )
    : html``,
  section(
    html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${view.items.map(ticketItem)}</table>`,
    '4px 28px 0',
  ),
  section(
    html`<div class="pz-alert" style="padding:12px 16px;border:2px solid ${light.accent};border-radius:10px;background:${light.alertBg};font-family:${bodyFont};font-size:17px;line-height:1.45;color:${light.ink}"><strong>${
      view.allergens.length > 0 ? `Allergeni nell’ordine: ${view.allergens.join(', ')}` : 'Nessun allergene dichiarato nell’ordine'
    }</strong></div>`,
    '4px 28px 20px',
  ),
  section(
    html`${button(orderUrl, 'Apri l’ordine nel pannello')}
<div class="pz-muted" style="margin-top:12px;font-family:${bodyFont};font-size:13px;line-height:1.5;color:${light.muted};word-break:break-all"><a href="${safeHref(orderUrl)}" style="color:${light.accent}">${orderUrl}</a></div>`,
    '0 28px 28px',
  ),
], { joined: true })}
<tr><td class="pz-pad" style="padding:16px 8px 0"><p class="pz-muted" style="margin:0;font-family:${bodyFont};font-size:12px;line-height:1.6;color:${light.muted}">Email automatica di ${business.name}: l’ordine è già pagato online.</p></td></tr>`;

  const text = [
    `NUOVO ORDINE n. ${order.number}`,
    `RITIRO ${pickup.dayWord} alle ${pickup.time}${pickup.dayWord === 'oggi' || pickup.dayWord === 'domani' ? ` (${pickup.weekdayDate})` : ''}`,
    `PAGATO online - ${summary}`,
    '',
    'CLIENTE',
    customerName,
    `Tel. ${customerPhone}`,
    ...(notes ? ['', 'NOTE DEL CLIENTE', ...notes.split(/\r\n|\r|\n/)] : []),
    '',
    'COMANDA',
    ...view.items.flatMap((item) => [...itemTextLines(item, 'ticket'), '']),
    view.allergens.length > 0 ? `ALLERGENI NELL’ORDINE: ${view.allergens.join(', ')}` : 'Nessun allergene dichiarato nell’ordine.',
    '',
    `Apri l’ordine: ${orderUrl}`,
  ].join('\n');

  return { subject, html: shell({ title: `Nuovo ordine n. ${order.number}`, preheader, body }), text };
}
