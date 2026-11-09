import { useId } from 'react';
import { getArt } from '../art/registry';
import { sauceRadius, doughLook } from '../geometry';
import { buildPizzaModel, type PizzaView } from '../model';
import { cn } from '@/lib/cn';
import { CheeseMelt } from './CheeseMelt';
import { PizzaBase } from './PizzaBase';
import { DrizzleLayers, PieceDefs, StaticPieces } from './toppings';

/**
 * A pizza with no animation: safe to render on the server. Used for menu cards, cart lines, the status page and
 * the admin, where the same description must always give the same picture.
 */
export function PizzaStatic({ view, className, label }: { view: PizzaView; className?: string; label?: string }) {
  const uid = `pz${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const model = buildPizzaModel(view, getArt);
  return (
    <div className={cn('relative aspect-square', className)} role="img" aria-label={label ?? 'Pizza'}>
      <PizzaBase uid={uid} dough={view.dough} sauce={view.sauce} seed={view.seed} />
      {model.melt && <CheeseMelt uid={uid} seed={view.seed} portions={model.melt.portions} sauceRadius={sauceRadius(doughLook(view.dough).crustWidth)} />}
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 size-full" aria-hidden="true" focusable="false">
        <PieceDefs uid={uid} model={model} />
        <g transform="translate(500 500)">
          <StaticPieces uid={uid} model={model} />
          <DrizzleLayers uid={uid} seed={view.seed} model={model} />
        </g>
      </svg>
    </div>
  );
}
