'use client';

import { ChevronUp, ReceiptText, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { AnimatedPrice } from '@/components/ui/price';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { Catalog, IngredientCategory } from '@/domain/catalog';
import { formatEUR } from '@/domain/money';
import { PricingError, priceLine } from '@/domain/pricing';
import { type CartLine, useCartStore } from '@/features/cart/store';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { PizzaCanvas } from '@/pizza/components/PizzaCanvas';
import { PizzaStatic } from '@/pizza/components/PizzaStatic';
import { visualScale } from '@/pizza/geometry';
import type { PizzaView } from '@/pizza/model';
import type { BuilderInit } from './init';
import { OnPizzaTicket } from './on-pizza';
import { StepBase } from './step-base';
import { StepIngredients } from './step-ingredients';
import {
  type BuilderState,
  builderReducer,
  canUndo,
  fromPizzaConfig,
  initialState,
  toPizzaConfig,
} from './state';

type Snap = 'min' | 'mid' | 'max';
const SHEET_HEIGHT: Record<Snap, string> = {
  min: 'calc(10.25rem + env(safe-area-inset-bottom))',
  mid: '46dvh',
  max: '82dvh',
};

export function BuilderSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:grid lg:grid-cols-[1fr_30rem]" aria-busy="true">
      <div className="grid flex-1 place-items-center">
        <Skeleton className="size-[min(70vw,28rem)] rounded-full" />
      </div>
      <Skeleton className="h-[46dvh] rounded-b-none rounded-t-3xl lg:h-full lg:rounded-none" />
    </div>
  );
}

/** A layout seed the server will accept (4-32 lowercase alphanumerics). Only ever called from event handlers. */
const freshSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Entry point: waits for the cart when editing a pizza that lives in it, then hands over to the real builder. */
export function BuilderClient({ catalog, init }: { catalog: Catalog; init: BuilderInit }) {
  const [session, setSession] = useState(init);
  const hydrated = useCartStore((s) => s.hydrated);
  const line = useCartStore((s) => (session.editLineId ? s.lines.find((l) => l.id === session.editLineId) : undefined));
  if (session.editLineId && !hydrated) return <BuilderSkeleton />;
  const editing = line?.type === 'pizza' ? line : undefined;
  return (
    <BuilderInner
      key={editing?.id ?? session.seed}
      catalog={catalog}
      init={session}
      editingLine={editing}
      missingEdit={Boolean(session.editLineId) && !editing}
      // "Crea un'altra pizza": same size and dough, but a clean pizza with its own seed, so it is drawn differently.
      onAnother={() => setSession((s) => ({ ...s, seed: freshSeed(), items: [], menuSlug: undefined, step: 1, editLineId: undefined, notices: [] }))}
    />
  );
}

type PizzaLine = Extract<CartLine, { type: 'pizza' }>;

function BuilderInner({
  catalog,
  init,
  editingLine,
  missingEdit,
  onAnother,
}: {
  catalog: Catalog;
  init: BuilderInit;
  editingLine?: PizzaLine;
  missingEdit: boolean;
  onAnother: () => void;
}) {
  const router = useRouter();
  const addPizza = useCartStore((s) => s.addPizza);
  const replacePizza = useCartStore((s) => s.replacePizza);

  const [state, dispatch] = useReducer(builderReducer, undefined, (): BuilderState =>
    editingLine ? fromPizzaConfig(editingLine.pizza, init.seed) : initialState({ size: init.size, dough: init.dough, sauce: init.sauce, seed: init.seed, menuSlug: init.menuSlug, items: init.items }),
  );
  const [step, setStep] = useState<1 | 2>(editingLine ? 2 : init.step);
  const [category, setCategory] = useState<IngredientCategory>('cheese');
  const [snap, setSnap] = useState<Snap>('mid');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [added, setAdded] = useState<{ view: PizzaView; label: string; cents: number } | null>(null);
  const [notices, setNotices] = useState<string[]>(() => [...init.notices, ...(missingEdit ? ['Non troviamo più questa pizza nel carrello: ne stai creando una nuova.'] : [])]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const size = catalog.sizes.find((s) => s.slug === state.size) ?? catalog.sizes[0]!;
  const menu = state.menuSlug ? catalog.menuPizzas.find((p) => p.slug === state.menuSlug) : undefined;

  const view = useMemo<PizzaView>(() => {
    const bySlug = new Map(catalog.ingredients.map((i) => [i.slug, i]));
    return {
      diameterCm: size.diameterCm,
      dough: state.dough,
      sauce: state.sauce,
      seed: state.seed,
      ingredients: state.items.map((item) => {
        const ingredient = bySlug.get(item.slug);
        return { slug: item.slug, portions: item.portions, afterBake: ingredient?.afterBake, category: ingredient?.category };
      }),
    };
  }, [catalog, size.diameterCm, state.dough, state.sauce, state.seed, state.items]);

  const priced = useMemo(() => {
    try {
      return { line: priceLine(catalog, { type: 'pizza', pizza: toPizzaConfig(state), quantity: 1 }), error: null };
    } catch (error) {
      if (error instanceof PricingError) return { line: null, error };
      throw error;
    }
  }, [catalog, state]);

  // Keep screen-reader users informed of every change, with the new total.
  const [announcement, setAnnouncement] = useState('');
  const previousItems = useRef(state.items);
  useEffect(() => {
    const before = previousItems.current;
    previousItems.current = state.items;
    if (before === state.items) return;
    const changed = state.items.find((i) => (before.find((b) => b.slug === i.slug)?.portions ?? 0) !== i.portions);
    const removed = before.find((b) => !state.items.some((i) => i.slug === b.slug));
    const total = priced.line ? ` Totale ${formatEUR(priced.line.unitPriceCents)}.` : '';
    if (changed) setAnnouncement(`${catalog.ingredients.find((i) => i.slug === changed.slug)?.name}: ${t.plural.portions(changed.portions)}.${total}`);
    else if (removed) setAnnouncement(`${catalog.ingredients.find((i) => i.slug === removed.slug)?.name} tolto.${total}`);
    else setAnnouncement(`Pizza svuotata.${total}`);
  }, [state.items, catalog.ingredients, priced.line]);

  // Tapping an ingredient while the sheet covers the pizza: pull it down so the toppings can be seen landing.
  const dispatchAndReveal: typeof dispatch = (action) => {
    if (snap === 'max' && (action.type === 'cycle' || action.type === 'increment')) setSnap('mid');
    dispatch(action);
  };

  const goStep = (next: 1 | 2) => {
    setStep(next);
    if (snap === 'min') setSnap('mid');
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const total = priced.line?.unitPriceCents ?? 0;
  const count = state.items.length;
  const sizeScale = visualScale(size.diameterCm, catalog.sizes.filter((s) => s.active).map((s) => s.diameterCm));
  const label = menu ? menu.name : 'Pizza personalizzata';

  const finish = () => {
    if (!priced.line) return;
    const config = toPizzaConfig(state);
    if (editingLine) {
      replacePizza(editingLine.id, config);
      toast('Modifiche salvate');
      router.push('/carrello');
      return;
    }
    addPizza(config, 1);
    setAdded({ view, label, cents: priced.line.unitPriceCents });
  };

  const another = () => {
    setAdded(null);
    onAnother();
  };

  const snapUp = () => setSnap((s) => (s === 'min' ? 'mid' : 'max'));
  const snapDown = () => setSnap((s) => (s === 'max' ? 'mid' : 'min'));
  const dragStart = useRef<number | null>(null);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(26rem,31rem)]">
      {/* ── Stage ─────────────────────────────────────────────── */}
      <section aria-label="La tua pizza" className="relative min-h-0 flex-1 overflow-hidden [container-type:size]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_58%_at_50%_52%,rgba(217,67,43,0.26),rgba(217,67,43,0.06)_55%,transparent_72%)]" />
        <div className="absolute inset-0 grid place-items-center">
          <PizzaCanvas view={view} sizeScale={sizeScale} animateOnMount={init.items.length > 0 || Boolean(editingLine)} className="w-[min(94cqw,94cqh)]" label={`${label}, ${t.plural.ingredients(count)}`} />
        </div>

        <button
          type="button"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={!canUndo(state)}
          className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-charcoal-950/80 px-4 py-2.5 text-sm font-semibold text-cream-100 shadow-[0_0_0_1px_var(--color-charcoal-500)] backdrop-blur transition-opacity hover:bg-charcoal-800 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <Undo2 className="size-4" aria-hidden="true" />
          Annulla
        </button>

        <div className="pointer-events-none absolute inset-y-0 right-5 hidden items-center xl:flex">
          <div className="pointer-events-auto max-h-[calc(100%-2.5rem)] w-72 overflow-y-auto rounded-t-md shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
            <OnPizzaTicket catalog={catalog} state={state} line={priced.line} dispatch={dispatch} />
          </div>
        </div>
      </section>

      {/* ── Controls: bottom sheet on phones, side panel on desktop ── */}
      <section
        aria-label="Costruisci la pizza"
        style={{ ['--sheet-h' as string]: SHEET_HEIGHT[snap] }}
        className="relative z-10 flex h-[var(--sheet-h)] min-h-0 flex-col rounded-t-[1.75rem] bg-charcoal-800 shadow-[0_-14px_44px_rgba(0,0,0,0.55)] transition-[height] duration-[350ms] ease-[var(--ease-land)] motion-reduce:transition-none lg:h-full lg:rounded-none lg:bg-charcoal-900 lg:shadow-none lg:ring-1 lg:ring-charcoal-600"
      >
        <button
          type="button"
          aria-label={snap === 'max' ? 'Riduci il pannello' : 'Ingrandisci il pannello'}
          aria-expanded={snap !== 'min'}
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const start = dragStart.current;
            dragStart.current = null;
            if (start === null) return;
            const dy = e.clientY - start;
            if (dy < -30) snapUp();
            else if (dy > 30) snapDown();
            else setSnap((s) => (s === 'mid' ? 'max' : 'mid'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') snapUp();
            else if (e.key === 'ArrowDown') snapDown();
          }}
          className="grid h-7 w-full shrink-0 touch-none place-items-center lg:hidden"
        >
          <span className="h-1.5 w-11 rounded-full bg-cream-100/30" />
        </button>

        <nav aria-label="Passaggi" className="flex shrink-0 gap-1 border-b border-charcoal-600 px-3 lg:pt-3">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => goStep(n)}
              aria-current={step === n ? 'step' : undefined}
              className={cn(
                'relative flex items-center gap-2 px-3 pb-2.5 pt-1.5 text-[0.95rem] font-semibold transition-colors',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-tomato-500 after:opacity-0 after:transition-opacity',
                step === n ? 'text-cream-50 after:opacity-100' : 'text-cream-400 hover:text-cream-100',
              )}
            >
              <span className={cn('figures grid size-6 place-items-center rounded-full text-xs', step === n ? 'bg-tomato-600 text-cream-50' : 'bg-charcoal-600 text-cream-200')}>{n}</span>
              {n === 1 ? 'Base' : 'Ingredienti'}
            </button>
          ))}
          {snap === 'min' && (
            <button type="button" onClick={() => setSnap('mid')} className="ml-auto flex items-center gap-1 px-3 text-sm text-cream-400 lg:hidden">
              Mostra <ChevronUp className="size-4" aria-hidden="true" />
            </button>
          )}
        </nav>

        <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', snap === 'min' && 'max-lg:hidden')}>
          {notices.length > 0 && (
            <div className="space-y-2 px-4 pt-3">
              {notices.map((n) => (
                <p key={n} className="flex items-start justify-between gap-3 rounded-sign bg-gold-400/12 px-3 py-2 text-sm text-gold-400 ring-1 ring-gold-400/30">
                  {n}
                  <button type="button" onClick={() => setNotices((cur) => cur.filter((x) => x !== n))} className="shrink-0 font-semibold underline">
                    Ok
                  </button>
                </p>
              ))}
            </div>
          )}
          {priced.error && (
            <p role="alert" className="mx-4 mt-3 rounded-sign bg-tomato-600/20 px-3 py-2 text-sm text-tomato-300 ring-1 ring-tomato-500/40">
              {priced.error.code === 'ITEM_UNAVAILABLE' ? 'Un ingrediente non è più disponibile: toglilo per continuare.' : 'Questa combinazione non è disponibile.'}
            </p>
          )}
          {step === 1 ? (
            <StepBase
              catalog={catalog}
              base={{ size: state.size, dough: state.dough, sauce: state.sauce }}
              menuPrices={menu?.prices}
              onChange={(field, value) => dispatch({ type: 'setBase', field, value })}
            />
          ) : (
            <StepIngredients catalog={catalog} state={state} size={size} category={category} onCategoryChange={setCategory} dispatch={dispatchAndReveal} />
          )}
        </div>

        <div className="shrink-0 border-t border-charcoal-600 bg-charcoal-900 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setTicketOpen(true)}
              aria-label={`Apri Sulla tua pizza, ${t.plural.ingredients(count)}`}
              className="relative grid size-11 shrink-0 place-items-center rounded-full bg-charcoal-700 text-cream-100 hover:bg-charcoal-600 active:scale-95 xl:hidden"
            >
              <ReceiptText className="size-5" aria-hidden="true" />
              {count > 0 && <span className="figures absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-tomato-600 text-[0.7rem] font-bold text-cream-50">{count}</span>}
            </button>
            <div className="shrink-0 leading-tight">
              <AnimatedPrice cents={total} className="display text-[1.6rem] sm:text-[1.85rem]" />
              <p className="text-xs text-cream-400">{t.common.vatIncluded}</p>
            </div>
            {step === 1 ? (
              <Button size="lg" className="min-w-0 flex-1 px-3 text-[0.95rem] sm:text-base" onClick={() => goStep(2)}>
                Scegli gli ingredienti
              </Button>
            ) : (
              <Button size="lg" className="min-w-0 flex-1 px-3 text-[0.95rem] sm:text-base" onClick={finish} disabled={!priced.line}>
                {editingLine ? 'Salva modifiche' : 'Aggiungi al carrello'}
              </Button>
            )}
          </div>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <Sheet open={ticketOpen} onOpenChange={setTicketOpen} title="Sulla tua pizza" hideTitle tone="paper" className="text-charcoal-900">
        <OnPizzaTicket catalog={catalog} state={state} line={priced.line} dispatch={dispatch} />
      </Sheet>

      <Sheet open={added !== null} onOpenChange={(open) => !open && setAdded(null)} title="Pizza aggiunta" description={added ? `${added.label}, ${formatEUR(added.cents)}` : undefined}>
        {added && (
          <div className="px-5 pb-6">
            <PizzaStatic view={added.view} className="mx-auto w-48" label={added.label} />
            <div className="mt-5 grid gap-2.5">
              <Button size="lg" asChild>
                <Link href="/carrello">Vai al carrello</Link>
              </Button>
              <Button size="lg" variant="secondary" onClick={another}>
                Crea un’altra pizza
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
