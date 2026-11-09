import { Shadow, Sparkle, idFor } from '../parts';
import type { IngredientArt, PieceProps } from '../../types';

/**
 * Verdure (vegetables, herbs). REFERENCE PIECES: funghi, basilico and olive-nere set the style for the rest of this
 * file. Baked vegetables are slightly browned at the edges; `afterBake` ones (basilico, rucola) look fresh and bright.
 */

// ── Funghi: a mushroom slice in silhouette (cap + stem) ──────────────────────────
const MUSHROOM = 'M-44 -4C-44 -34 -22 -46 0 -46C22 -46 44 -34 44 -4C44 2 38 6 30 6L14 6C14 14 15 28 17 40C17 44 14 46 10 46L-10 46C-14 46 -17 44 -17 40C-15 28 -14 14 -14 6L-30 6C-38 6 -44 2 -44 -4Z';

function Funghi({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'fun', variant);
  const transform = ['', 'scale(1.1 0.94) skewX(-5)', 'scale(0.88 1.08) skewX(4)'][variant] ?? '';
  return (
    <g transform={transform}>
      <g transform="translate(2.4 3.4)" fill="#1a0a04" fillOpacity="0.3">
        <path d={MUSHROOM} />
      </g>
      <defs>
        <linearGradient id={g} x1="-40" y1="-40" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f8efdc" />
          <stop offset="0.6" stopColor="#ecdcba" />
          <stop offset="1" stopColor="#d9c39a" />
        </linearGradient>
      </defs>
      <path d={MUSHROOM} fill={`url(#${g})`} />
      <path d={MUSHROOM} fill="none" stroke="#a8825a" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-44 -4C-44 -34 -22 -46 0 -46C22 -46 44 -34 44 -4" fill="none" stroke="#a37a52" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M-33 -3C-30 -26 -14 -36 0 -36C14 -36 30 -26 33 -3" fill="none" stroke="#d6c096" strokeWidth="2" strokeLinecap="round" />
      <path d="M-12 8C-11 20 -10 32 -8 40" fill="none" stroke="#d3bc90" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-30 -30C-22 -38 -12 -41 -2 -42" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

// ── Basilico: a fresh leaf ───────────────────────────────────────────────────────
const LEAF = 'M0 47C-27 36 -36 8 -22 -22C-14 -38 -5 -46 0 -49C5 -46 14 -38 22 -22C36 8 27 36 0 47Z';

function Leaf({ uid, variant, scale = 1, rotate = 0, x = 0, y = 0 }: { uid: string; variant: number; scale?: number; rotate?: number; x?: number; y?: number }) {
  const g = idFor(uid, 'bas', variant, Math.round(rotate));
  const veins = [1, 2, 3, 4, 5].map((i) => {
    const yy = 38 - i * 15;
    return `M0 ${yy}C-8 ${yy - 3} -16 ${yy - 10} -22 ${yy - 18}M0 ${yy}C8 ${yy - 3} 16 ${yy - 10} 22 ${yy - 18}`;
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <g transform="translate(2.2 3.2)" fill="#0d1a08" fillOpacity="0.3">
        <path d={LEAF} />
      </g>
      <defs>
        <linearGradient id={g} x1="-30" y1="0" x2="30" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f7f31" />
          <stop offset="0.5" stopColor="#58b24b" />
          <stop offset="0.8" stopColor="#7ccc5e" />
          <stop offset="1" stopColor="#3f9040" />
        </linearGradient>
      </defs>
      <path d={LEAF} fill={`url(#${g})`} />
      <path d={LEAF} fill="none" stroke="#1e5a24" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" />
      <path d={veins.join('')} fill="none" stroke="#c4e8a0" strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M0 45L0 -42" fill="none" stroke="#d3f0ac" strokeOpacity="0.85" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-10 -30C-18 -14 -20 4 -14 22" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

function Basilico({ variant, uid }: PieceProps) {
  if (variant === 1) return <g transform="skewX(-7)"><Leaf uid={uid} variant={1} scale={0.92} /></g>;
  if (variant === 2) {
    return (
      <>
        <Leaf uid={uid} variant={2} scale={0.78} rotate={-24} x={-9} y={3} />
        <Leaf uid={uid} variant={2} scale={0.7} rotate={26} x={11} y={-2} />
      </>
    );
  }
  return <Leaf uid={uid} variant={0} />;
}

// ── Olive nere: a ring with a real hole ──────────────────────────────────────────
function OliveNere({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'oli', variant);
  const rx = [46, 47, 46][variant] ?? 46;
  const ry = [44, 40, 44][variant] ?? 44;
  const ring = `M${-rx} 0a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0ZM-18 0a18 17 0 1 0 36 0a18 17 0 1 0 -36 0Z`;
  const half = `M${-rx} 0a${rx} ${ry} 0 0 1 ${rx * 2} 0L18 0a18 17 0 0 0 -36 0Z`;
  const d = variant === 2 ? half : ring;
  return (
    <g transform={variant === 1 ? 'rotate(18)' : ''}>
      <g transform="translate(2.6 3.8)" fill="#120905" fillOpacity="0.36">
        <path d={d} fillRule="evenodd" />
      </g>
      <defs>
        <radialGradient id={g} cx="-14" cy="-16" r="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#554a4e" />
          <stop offset="0.6" stopColor="#2b2427" />
          <stop offset="1" stopColor="#120d11" />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${g})`} fillRule="evenodd" />
      {variant !== 2 && <path d="M-18 0a18 17 0 1 0 36 0a18 17 0 1 0 -36 0Z" fill="none" stroke="#07040a" strokeOpacity="0.65" strokeWidth="3" />}
      {variant !== 2 && <path d="M13 11A18 17 0 0 1 -11 14" fill="none" stroke="#9a8d92" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />}
      <path d="M-34 -24A42 40 0 0 1 -6 -42" fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="4" strokeLinecap="round" />
      <Sparkle x={-28} y={-31} r={1.8} o={0.5} />
    </g>
  );
}

export const vegArt: IngredientArt[] = [
  { slug: 'funghi', sizeCm: 4.4, density: 14, scatter: 'discrete', layer: 30, variants: 3, rotation: 'free', scaleJitter: 0.12, Piece: Funghi },
  { slug: 'basilico', sizeCm: 5, density: 4, scatter: 'discrete', layer: 35, variants: 3, rotation: 'free', scaleJitter: 0.14, Piece: Basilico },
  { slug: 'olive-nere', sizeCm: 2.5, density: 17, scatter: 'discrete', layer: 30, variants: 3, rotation: 'free', scaleJitter: 0.08, Piece: OliveNere },
];
