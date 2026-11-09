'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useId, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { getArt } from '../art/registry';
import { doughLook } from '../geometry';
import { buildPizzaModel, type PieceInstance, type PizzaView } from '../model';
import { hashString } from '../rng';
import { CheeseMeltContent } from './CheeseMelt';
import { PizzaBase } from './PizzaBase';
import { DrizzleLayers, PieceDefs, pieceDomId, pieceTransform } from './toppings';

export interface PizzaCanvasProps {
  view: PizzaView;
  /** Springy drop-in for pieces added after the first render (default true). */
  animated?: boolean;
  /** Also drop in the pieces already present on first render (hero demo, "Personalizza" preload). */
  animateOnMount?: boolean;
  /** 0.78 … 1: visual size of the whole pizza on its stage, so "Grande" really looks bigger. */
  sizeScale?: number;
  className?: string;
  label?: string;
}

/**
 * The interactive pizza. A static base (board, crust, sauce) is painted once; the cheese fades in; toppings spring in
 * from above and scatter to their landing spots (staggered, with a little spin), and shrink away when removed.
 * Positions come from the model, so nothing ever jumps. `prefers-reduced-motion` turns the flight into a fade
 * (via the app-wide <MotionConfig reducedMotion="user">).
 */
export function PizzaCanvas({ view, animated = true, animateOnMount = false, sizeScale = 1, className, label }: PizzaCanvasProps) {
  const uid = `pz${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const model = useMemo(() => buildPizzaModel(view, getArt), [view]);

  const known = useRef<Set<string>>(new Set());
  const hasMounted = useRef(false);
  const flat = model.groups.flatMap((group) => group.pieces.map((piece) => ({ slug: group.slug, piece })));
  const flying = animated && (hasMounted.current || animateOnMount);

  useEffect(() => {
    known.current = new Set(flat.map(({ piece }) => piece.key));
    hasMounted.current = true;
  });

  let order = 0;

  return (
    <div className={cn('relative aspect-square select-none', className)} role="img" aria-label={label ?? 'Pizza'}>
      <m.div
        className="absolute inset-0"
        initial={false}
        animate={{ scale: sizeScale }}
        transition={{ type: 'spring', stiffness: 170, damping: 20 }}
      >
        <PizzaBase uid={uid} dough={view.dough} sauce={view.sauce} seed={view.seed} />

        <AnimatePresence initial={animateOnMount}>
          {model.melt && (
            <m.svg
              key={model.melt.portions >= 2 ? 'melt-2' : 'melt-1'}
              viewBox="0 0 1000 1000"
              className="absolute inset-0 size-full"
              aria-hidden="true"
              focusable="false"
              initial={flying || animateOnMount ? { opacity: 0, scale: 0.94 } : false}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <g transform="translate(500 500)">
                <CheeseMeltContent uid={uid} seed={view.seed} portions={model.melt.portions} sauceRadius={model.sauceRadius} />
              </g>
            </m.svg>
          )}
        </AnimatePresence>

        <svg viewBox="0 0 1000 1000" className="absolute inset-0 size-full overflow-visible" aria-hidden="true" focusable="false">
          <PieceDefs uid={uid} model={model} />
          <g transform="translate(500 500)">
            <AnimatePresence initial={false}>
              {flat.map(({ slug, piece }) => {
                const fresh = flying && !known.current.has(piece.key);
                const delay = fresh ? Math.min(order++ * 0.03, 0.45) : 0;
                return <DroppingPiece key={piece.key} uid={uid} slug={slug} piece={piece} fresh={fresh} delay={delay} />;
              })}
            </AnimatePresence>
            <DrizzleLayers uid={uid} seed={view.seed} model={model} />
          </g>
        </svg>
      </m.div>
    </div>
  );
}

function DroppingPiece({ uid, slug, piece, fresh, delay }: { uid: string; slug: string; piece: PieceInstance; fresh: boolean; delay: number }) {
  // Deterministic per piece, so the toss looks the same every time and never needs Math.random().
  const h = hashString(piece.key);
  const dx = -piece.x * 0.35 + ((h % 61) - 30);
  const dy = -piece.y * 0.35 - 170 - ((h >>> 8) % 40);
  const spin = ((h >>> 16) % 71) - 35;

  return (
    <g transform={`translate(${piece.x} ${piece.y})`}>
      <m.g
        initial={fresh ? { x: dx, y: dy, scale: 1.65, rotate: spin, opacity: 0 } : false}
        animate={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.55, opacity: 0, transition: { duration: 0.16 } }}
        transition={{ type: 'spring', stiffness: 220, damping: 16, mass: 0.9, delay, opacity: { duration: 0.1, delay } }}
      >
        <g transform={pieceTransform(piece)}>
          <use href={`#${pieceDomId(uid, slug, piece.variant)}`} />
        </g>
      </m.g>
    </g>
  );
}
