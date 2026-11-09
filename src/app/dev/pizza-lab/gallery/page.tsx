import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ingredients as seedIngredients } from '@/db/seed/data';
import { devFeaturesEnabled } from '@/env';
import { getArt, hasArt } from '@/pizza/art/registry';
import { PizzaStatic } from '@/pizza/components/PizzaStatic';

export const metadata = { title: 'Art gallery', robots: { index: false, follow: false } };

const CATEGORIES = ['cheese', 'cured', 'veg', 'fish', 'extra'] as const;

/**
 * Dev-only review sheet for ingredient art: `/dev/pizza-lab/gallery?category=cured` (or `all`, or `slugs=a,b`).
 * For each ingredient: every variant large on sauce and on cheese, plus the real thing in situ on a 30 cm pizza.
 */
export default function Page(props: PageProps<'/dev/pizza-lab/gallery'>) {
  if (!devFeaturesEnabled()) notFound();
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Gallery searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Gallery({ searchParams }: { searchParams: PageProps<'/dev/pizza-lab/gallery'>['searchParams'] }) {
  const params = await searchParams;
  const category = typeof params.category === 'string' ? params.category : 'all';
  const slugs = typeof params.slugs === 'string' ? params.slugs.split(',') : null;
  const list = seedIngredients.filter((i) => (slugs ? slugs.includes(i.slug) : category === 'all' || i.category === category));

  return (
    <main className="mx-auto max-w-[1500px] p-4 sm:p-8">
      <h1 className="display text-3xl">Art gallery: {slugs ? slugs.join(', ') : category}</h1>
      <p className="mt-1 text-sm text-cream-400">
        {CATEGORIES.map((c) => (
          <a key={c} className="mr-3 underline" href={`?category=${c}`}>
            {c}
          </a>
        ))}
        <a className="underline" href="?category=all">
          all
        </a>
      </p>

      <div className="mt-6 space-y-10">
        {list.map((ing) => {
          const art = getArt(ing.slug, ing.category);
          const Piece = art.Piece;
          const view = (portions: number) => ({
            diameterCm: 30,
            dough: 'classica',
            sauce: 'rossa',
            seed: `gal-${ing.slug}`,
            ingredients: [
              { slug: 'mozzarella', portions: 1, category: 'cheese' as const },
              { slug: ing.slug, portions, afterBake: ing.afterBake, category: ing.category },
            ],
          });
          return (
            <section key={ing.slug} id={ing.slug} className="grid gap-6 lg:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-xl font-semibold">
                  {ing.name}{' '}
                  <span className="text-sm font-normal text-cream-400">
                    {ing.slug} · {art.sizeCm} cm · {art.density}/portion · {art.scatter} · layer {art.layer}
                    {ing.afterBake ? ' · after bake' : ''} · {hasArt(ing.slug) ? 'dedicated art' : 'GENERIC'}
                  </span>
                </h2>
                {art.scatter !== 'melt' && art.scatter !== 'drizzle' ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {Array.from({ length: art.variants }, (_, v) => (
                      <div key={v} className="flex flex-col gap-2">
                        <svg viewBox="-60 -60 120 120" className="size-44 rounded" style={{ background: 'radial-gradient(circle at 35% 30%, #e24f33, #b8301d 70%, #9b2615)' }}>
                          <Piece variant={v} uid={`g-${ing.slug}-${v}-a`} />
                        </svg>
                        <svg viewBox="-60 -60 120 120" className="size-44 rounded" style={{ background: 'radial-gradient(circle at 35% 30%, #fcf2d3, #f0dcab 70%, #e5c98e)' }}>
                          <Piece variant={v} uid={`g-${ing.slug}-${v}-b`} />
                        </svg>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-cream-400">Drawn as a continuous layer: see the pizzas on the right.</p>
                )}
              </div>
              <div className="flex gap-4">
                {[1, 2].map((portions) => (
                  <div key={portions} className="w-72">
                    <PizzaStatic view={view(portions)} label={`${ing.name} x${portions}`} />
                    <p className="mt-1 text-center text-xs text-cream-400">{portions}× on a 30 cm pizza (with mozzarella)</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
