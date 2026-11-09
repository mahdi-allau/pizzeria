'use client';

import { useMemo, useState } from 'react';
import { getArt, hasArt } from '@/pizza/art/registry';
import { PizzaCanvas } from '@/pizza/components/PizzaCanvas';
import { visualScale } from '@/pizza/geometry';
import type { PizzaView } from '@/pizza/model';
import { ingredients as seedIngredients } from '@/db/seed/data';

const SIZES = [24, 30, 36];
const DOUGHS = ['classica', 'integrale', 'senza-glutine'];
const SAUCES = ['rossa', 'bianca', 'nessuna'];
const PRESETS: Record<string, Array<[string, number]>> = {
  Margherita: [['mozzarella', 1], ['basilico', 1]],
  Capricciosa: [['mozzarella', 1], ['prosciutto-cotto', 1], ['funghi', 1], ['carciofi', 1], ['olive-nere', 1]],
  Diavola: [['mozzarella', 1], ['salame-piccante', 2]],
};

const pill = (active: boolean) =>
  `rounded-sign border px-3 py-1.5 text-sm ${active ? 'border-tomato-400 bg-tomato-600 text-cream-50' : 'border-charcoal-500 text-cream-200 hover:bg-charcoal-700'}`;

export function PizzaLab() {
  const [dough, setDough] = useState('classica');
  const [sauce, setSauce] = useState('rossa');
  const [size, setSize] = useState(30);
  const [seed, setSeed] = useState('lab01');
  const [picked, setPicked] = useState<Array<{ slug: string; portions: number }>>([]);

  const view = useMemo<PizzaView>(
    () => ({
      diameterCm: size,
      dough,
      sauce,
      seed,
      ingredients: picked.map((p) => {
        const meta = seedIngredients.find((i) => i.slug === p.slug);
        return { slug: p.slug, portions: p.portions, afterBake: meta?.afterBake, category: meta?.category };
      }),
    }),
    [size, dough, sauce, seed, picked],
  );

  const bump = (slug: string) =>
    setPicked((cur) => {
      const meta = seedIngredients.find((i) => i.slug === slug);
      const max = meta?.maxPortions ?? 2;
      const found = cur.find((p) => p.slug === slug);
      if (!found) return [...cur, { slug, portions: 1 }];
      if (found.portions >= max) return cur.filter((p) => p.slug !== slug);
      return cur.map((p) => (p.slug === slug ? { ...p, portions: p.portions + 1 } : p));
    });

  const applyPreset = (name: string) => setPicked((PRESETS[name] ?? []).map(([slug, portions]) => ({ slug, portions })));
  const portionsOf = (slug: string) => picked.find((p) => p.slug === slug)?.portions ?? 0;
  const withArt = seedIngredients.filter((i) => hasArt(i.slug)).length;

  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-8">
      <h1 className="display text-4xl">Pizza lab</h1>
      <p className="mt-1 text-sm text-cream-400">
        {withArt} of {seedIngredients.length} ingredients have dedicated art. The rest use a generic category look.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,640px)_1fr]">
        <section className="lg:sticky lg:top-4 lg:self-start">
          <div className="mx-auto w-full max-w-[640px]">
            <PizzaCanvas view={view} sizeScale={visualScale(size, SIZES)} label="Pizza lab" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button key={s} className={pill(size === s)} onClick={() => setSize(s)}>
                {s} cm
              </button>
            ))}
            {DOUGHS.map((d) => (
              <button key={d} className={pill(dough === d)} onClick={() => setDough(d)}>
                {d}
              </button>
            ))}
            {SAUCES.map((s) => (
              <button key={s} className={pill(sauce === s)} onClick={() => setSauce(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {Object.keys(PRESETS).map((name) => (
              <button key={name} className={pill(false)} onClick={() => applyPreset(name)}>
                {name}
              </button>
            ))}
            <button className={pill(false)} onClick={() => setPicked([])}>
              Clear
            </button>
            <button className={pill(false)} onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}>
              New seed
            </button>
            <span className="text-xs text-cream-400">seed {seed}</span>
          </div>
        </section>

        <section>
          <h2 className="display text-2xl">Ingredients (tap: 1× → 2× → off)</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {seedIngredients.map((i) => {
              const n = portionsOf(i.slug);
              return (
                <button
                  key={i.slug}
                  onClick={() => bump(i.slug)}
                  className={`rounded-sign border px-3 py-2 text-left text-sm ${n ? 'border-tomato-400 bg-charcoal-700' : 'border-charcoal-600 hover:bg-charcoal-800'}`}
                >
                  <span className="block font-semibold">
                    {i.name} {n > 0 && <span className="text-tomato-400">×{n}</span>}
                  </span>
                  <span className="text-xs text-cream-400">
                    {i.category} {hasArt(i.slug) ? '· art ✓' : '· generic'}
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="display mt-10 text-2xl">Art gallery</h2>
          <p className="text-sm text-cream-400">Every variant of every ingredient, on sauce and on cheese.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {seedIngredients.map((i) => {
              const art = getArt(i.slug, i.category);
              if (art.scatter === 'melt' || art.scatter === 'drizzle') return null;
              const Piece = art.Piece;
              return (
                <div key={i.slug} className="rounded-sign border border-charcoal-600 p-3">
                  <p className="mb-2 text-sm font-semibold">
                    {i.name} <span className="text-xs font-normal text-cream-400">{art.sizeCm} cm · {hasArt(i.slug) ? 'art' : 'generic'}</span>
                  </p>
                  <div className="flex gap-2">
                    {Array.from({ length: art.variants }, (_, v) => (
                      <svg key={v} viewBox="-60 -60 120 120" className="size-24 rounded" style={{ background: v % 2 === 0 ? '#c2351f' : '#f2e1b3' }}>
                        <Piece variant={v} uid={`lab-${i.slug}-${v}`} />
                      </svg>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
