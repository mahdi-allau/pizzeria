import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getArt, hasArt, registeredArt } from '@/pizza/art/registry';
import { ingredients as seedIngredients } from '@/db/seed/data';

/**
 * The contract every ingredient's art must honour (see docs/design-direction.md). These tests are the guard rails
 * for anyone drawing a new piece: they catch the things that break performance, hydration or page-wide id clashes.
 */

const arts = registeredArt();
const UID = 'pzTEST';
const markup = (slug: string, variant: number) => {
  const { Piece } = getArt(slug);
  return renderToStaticMarkup(<Piece variant={variant} uid={UID} />);
};
const elementCount = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;

describe('registry', () => {
  it('has unique slugs', () => {
    expect(new Set(arts.map((a) => a.slug)).size).toBe(arts.length);
  });

  it('only registers art for ingredients that exist in the catalog seed', () => {
    const known = new Set(seedIngredients.map((i) => i.slug));
    for (const art of arts) expect(known.has(art.slug), `unknown ingredient "${art.slug}"`).toBe(true);
  });

  it('falls back to a generic look for unknown slugs instead of breaking', () => {
    expect(hasArt('ananas-brasiliano')).toBe(false);
    const art = getArt('ananas-brasiliano', 'veg');
    expect(art.variants).toBeGreaterThanOrEqual(1);
    expect(() => renderToStaticMarkup(<art.Piece variant={0} uid={UID} />)).not.toThrow();
  });
});

describe.each(arts.filter((a) => a.scatter !== 'melt' && a.scatter !== 'drizzle'))('art: $slug', (art) => {
  it('has a sensible real-world size, density and layer', () => {
    expect(art.sizeCm).toBeGreaterThanOrEqual(0.3);
    expect(art.sizeCm).toBeLessThanOrEqual(12);
    expect(art.density).toBeGreaterThanOrEqual(1);
    expect(art.layer).toBeGreaterThanOrEqual(10);
    expect(art.layer).toBeLessThanOrEqual(70);
  });

  it('offers at least 3 variants so a pizza never looks stamped', () => {
    expect(art.variants).toBeGreaterThanOrEqual(3);
  });

  it.each(Array.from({ length: art.variants }, (_, i) => i))('variant %i renders valid, filter-free, namespaced SVG', (variant) => {
    const html = markup(art.slug, variant);
    expect(html.length).toBeGreaterThan(40);

    // Performance: ~150 pieces are on screen at once on a phone.
    expect(html).not.toMatch(/<filter|feGaussianBlur|feTurbulence|feDropShadow|<foreignObject|<image/i);
    expect(elementCount(html), `${art.slug}#${variant} has too many elements`).toBeLessThanOrEqual(60);

    // Several pizzas share one page: every id must be namespaced with the uid we pass in.
    for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) expect(id!.startsWith(UID), `id "${id}" must start with the uid`).toBe(true);

    // Hydration: no non-finite numbers leaking into attributes.
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('is deterministic (the same pizza must draw identically on server and client)', () => {
    for (let v = 0; v < art.variants; v++) expect(markup(art.slug, v)).toBe(markup(art.slug, v));
  });

  it('draws variants that actually differ', () => {
    const all = Array.from({ length: art.variants }, (_, v) => markup(art.slug, v));
    expect(new Set(all).size, `${art.slug}: variants are identical`).toBe(art.variants);
  });
});

describe('drizzle art', () => {
  it('every drizzle provides a Layer that is filter-free, finite and namespaced', () => {
    for (const art of arts.filter((a) => a.scatter === 'drizzle')) {
      expect(art.Layer, `${art.slug} needs a Layer`).toBeTypeOf('function');
      const Layer = art.Layer!;
      const html = renderToStaticMarkup(<Layer uid={UID} seed="abc12345" portions={1} radius={360} />);
      expect(html).not.toMatch(/<filter|NaN|undefined|Infinity/);
      for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) expect(id!.startsWith(UID)).toBe(true);
    }
  });
});

describe('coverage', () => {
  it('has dedicated art for every ingredient in the seed catalog', () => {
    const missing = seedIngredients.filter((i) => !hasArt(i.slug)).map((i) => i.slug);
    expect(missing, `still on the generic look: ${missing.join(', ')}`).toEqual([]);
  });
});
