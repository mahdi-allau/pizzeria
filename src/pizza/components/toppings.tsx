import { getArt } from '../art/registry';
import type { PieceInstance, PizzaModel } from '../model';

/** Shared pieces of the toppings layer, used by both the static and the animated pizza. */

export const pieceDomId = (uid: string, slug: string, variant: number) => `${uid}-p-${slug}-${variant}`;

export const pieceTransform = (p: PieceInstance) => `rotate(${p.rotation}) scale(${p.flip ? -p.scale : p.scale} ${p.scale})`;

/** One <g id> per (ingredient, variant) actually in use; every piece on the pizza is a cheap <use> of one of these. */
export function PieceDefs({ uid, model }: { uid: string; model: PizzaModel }) {
  return (
    <defs>
      {model.groups.flatMap((group) => {
        const Piece = group.art.Piece;
        return [...new Set(group.pieces.map((p) => p.variant))].map((variant) => (
          <g key={`${group.slug}-${variant}`} id={pieceDomId(uid, group.slug, variant)}>
            <Piece variant={variant} uid={uid} />
          </g>
        ));
      })}
    </defs>
  );
}

export function StaticPieces({ uid, model }: { uid: string; model: PizzaModel }) {
  return (
    <>
      {model.groups.flatMap((group) =>
        group.pieces.map((p) => (
          <g key={p.key} transform={`translate(${p.x} ${p.y})`}>
            <g transform={pieceTransform(p)}>
              <use href={`#${pieceDomId(uid, group.slug, p.variant)}`} />
            </g>
          </g>
        )),
      )}
    </>
  );
}

/** Continuous patterns (olive oil) drawn by the ingredient's own `Layer`. */
export function DrizzleLayers({ uid, seed, model }: { uid: string; seed: string; model: PizzaModel }) {
  return (
    <>
      {model.drizzles.map((d) => {
        const Layer = getArt(d.slug).Layer;
        return Layer ? <Layer key={d.slug} uid={uid} seed={seed} portions={d.portions} radius={model.sauceRadius} /> : null;
      })}
    </>
  );
}

export function pizzaLabel(parts: { size?: string; items: string[] }): string {
  const base = parts.size ? `Pizza ${parts.size}` : 'Pizza';
  return parts.items.length ? `${base} con ${parts.items.join(', ')}` : `${base} senza ingredienti`;
}
