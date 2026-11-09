/**
 * Minimal HTML builder that escapes by construction.
 *
 * Every value interpolated into `html\`...\`` is escaped unless it is already a `SafeHtml` fragment. A template author
 * therefore cannot forget to escape a customer's name or notes: the only way to emit raw markup is `raw()`, and that
 * is used for the static, trusted parts of the templates only.
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Marks a string as trusted markup. Never pass user input here. */
export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, index) => {
    out += render(value) + (strings[index + 1] ?? '');
  });
  return new SafeHtml(out);
}

/** Escapes a multi-line text and keeps its line breaks. */
export function nl2br(text: string): SafeHtml {
  return new SafeHtml(escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>'));
}

const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'tel:', 'mailto:']);

/** Returns the URL if it is a web, phone or mail link, otherwise "#": no `javascript:` or `data:` can reach an href. */
export function safeHref(url: string): string {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : '#';
  } catch {
    return '#';
  }
}
