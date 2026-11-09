import type { IngredientCategory } from '../../domain/catalog';
import type { IngredientArt, PieceProps } from '../types';
import { blobPath } from './shapes';
import { Shadow, Sparkle, idFor } from './parts';

/**
 * Generic look for an ingredient that has no dedicated art yet (e.g. one the pizzeria adds in the admin):
 * a recognisable colour and shape for its category, so it still lands on the pizza and nothing breaks.
 */

interface Style {
  size: number;
  density: number;
  stops: [string, string, string];
  edge: string;
  wobble: number;
  radius: number;
  squash: number;
}

const STYLES: Record<IngredientCategory, Style> = {
  cheese: { size: 3.4, density: 12, stops: ['#fff7dc', '#f3e2b0', '#dcc387'], edge: '#b9984f', wobble: 0.1, radius: 36, squash: 1 },
  cured: { size: 4.6, density: 11, stops: ['#e9917c', '#cc5a47', '#9a3022'], edge: '#7a2217', wobble: 0.03, radius: 42, squash: 1 },
  veg: { size: 4, density: 13, stops: ['#8fd067', '#4ea24a', '#2c6b2f'], edge: '#1f4f23', wobble: 0.14, radius: 38, squash: 0.85 },
  fish: { size: 4, density: 10, stops: ['#f7b98c', '#e58c55', '#b95a2b'], edge: '#8a3f1c', wobble: 0.16, radius: 36, squash: 0.8 },
  extra: { size: 2.2, density: 16, stops: ['#d9b27a', '#b98649', '#7d5226'], edge: '#5c3a18', wobble: 0.2, radius: 30, squash: 1 },
};

function makePiece(style: Style, key: string) {
  return function GenericPiece({ variant, uid }: PieceProps) {
    const g = idFor(uid, 'fb', key, variant);
    const d = blobPath(style.radius, style.wobble, `fb-${key}-${variant}`, 10, style.squash);
    return (
      <>
        <Shadow rx={style.radius * style.squash} ry={style.radius} />
        <defs>
          <radialGradient id={g} cx="-10" cy="-12" r={style.radius * 1.3} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={style.stops[0]} />
            <stop offset="0.55" stopColor={style.stops[1]} />
            <stop offset="1" stopColor={style.stops[2]} />
          </radialGradient>
        </defs>
        <path d={d} fill={`url(#${g})`} />
        <path d={d} fill="none" stroke={style.edge} strokeOpacity="0.5" strokeWidth="2" />
        <Sparkle x={-style.radius * 0.45} y={-style.radius * 0.5} r={2} o={0.5} />
      </>
    );
  };
}

const pieces = Object.fromEntries((Object.keys(STYLES) as IngredientCategory[]).map((c) => [c, makePiece(STYLES[c], c)])) as Record<
  IngredientCategory,
  ReturnType<typeof makePiece>
>;

const LAYERS: Record<IngredientCategory, number> = { cheese: 20, veg: 30, cured: 40, fish: 50, extra: 60 };

const memo = new Map<string, IngredientArt>();

export function fallbackArt(slug: string, category: IngredientCategory = 'veg'): IngredientArt {
  const key = `${slug}|${category}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const style = STYLES[category];
  const art: IngredientArt = {
    slug,
    sizeCm: style.size,
    density: style.density,
    scatter: 'discrete',
    layer: LAYERS[category],
    variants: 3,
    rotation: 'free',
    scaleJitter: 0.12,
    Piece: pieces[category],
  };
  memo.set(key, art);
  return art;
}
