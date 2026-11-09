import { describe, expect, it } from 'vitest';
import { SafeHtml, escapeHtml, html, nl2br, raw, safeHref } from '@/server/email/html';

describe('escapeHtml', () => {
  it('escapes the five characters that can break out of text or attributes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('leaves ordinary Italian text untouched', () => {
    expect(escapeHtml('Perché è già così: 5,00 € e “virgolette”')).toBe('Perché è già così: 5,00 € e “virgolette”');
  });
});

describe('html tagged template', () => {
  it('escapes every interpolated string', () => {
    const name = '<img src=x onerror=alert(1)>';
    expect(html`<td>${name}</td>`.toString()).toBe('<td>&lt;img src=x onerror=alert(1)&gt;</td>');
  });

  it('keeps a nested SafeHtml fragment as markup', () => {
    const inner = html`<b>${'a & b'}</b>`;
    expect(html`<p>${inner}</p>`.toString()).toBe('<p><b>a &amp; b</b></p>');
  });

  it('escapes attribute values so they cannot close the quote', () => {
    const evil = '" onmouseover="alert(1)';
    expect(html`<a title="${evil}">x</a>`.toString()).toBe('<a title="&quot; onmouseover=&quot;alert(1)">x</a>');
  });

  it('renders numbers, and nothing at all for null, undefined and booleans', () => {
    expect(html`${42}|${null}|${undefined}|${false}|${true}`.toString()).toBe('42||||');
  });

  it('flattens arrays, escaping plain strings and keeping fragments', () => {
    const rows = ['<x>', html`<i>ok</i>`, 7];
    expect(html`<ul>${rows}</ul>`.toString()).toBe('<ul>&lt;x&gt;<i>ok</i>7</ul>');
  });

  it('returns a SafeHtml so the result is never escaped twice', () => {
    expect(html`<hr>`).toBeInstanceOf(SafeHtml);
    expect(raw('<br>').toString()).toBe('<br>');
  });
});

describe('nl2br', () => {
  it('escapes first, then turns line breaks into <br>', () => {
    expect(nl2br('riga <uno>\nriga due\r\nriga "tre"').toString()).toBe('riga &lt;uno&gt;<br>riga due<br>riga &quot;tre&quot;');
  });
});

describe('safeHref', () => {
  it('lets through web, phone and mail links', () => {
    expect(safeHref('https://example.it/ordine/abc')).toBe('https://example.it/ordine/abc');
    expect(safeHref('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(safeHref('tel:+390600000000')).toBe('tel:+390600000000');
    expect(safeHref('mailto:info@example.it')).toBe('mailto:info@example.it');
  });

  it('neutralises any other scheme', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html;base64,AAAA')).toBe('#');
    expect(safeHref('not a url')).toBe('#');
    expect(safeHref('')).toBe('#');
  });
});
