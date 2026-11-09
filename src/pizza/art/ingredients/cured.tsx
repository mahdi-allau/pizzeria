import { blobPath, dotsPath, scatterDots } from '../shapes';
import { Shadow, Sparkle, idFor } from '../parts';
import type { IngredientArt, PieceProps } from '../../types';

/**
 * Salumi (cured meats). REFERENCE PIECE: salame-piccante sets the style for the rest of this file.
 * Layering: contact shadow → body gradient → casing rim → fat flecks & pepper → oil sheen.
 */

function SalamePiccante({ variant, uid }: PieceProps) {
  const radius = [46, 44, 45][variant] ?? 46;
  const squash = [1, 0.93, 0.97][variant] ?? 1;
  const edge = blobPath(radius, 0.025, `sal-edge-${variant}`, 12, squash);
  const rim = blobPath(radius - 4.5, 0.02, `sal-rim-${variant}`, 12, squash);
  const fat = dotsPath(scatterDots(`sal-fat-${variant}`, 15, radius - 8, 2, 5.2));
  const pepper = dotsPath(scatterDots(`sal-pep-${variant}`, 10, radius - 7, 1, 2));
  const g = idFor(uid, 'sal', variant);
  return (
    <>
      <Shadow rx={radius * squash} ry={radius} />
      <defs>
        <radialGradient id={g} cx="-14" cy="-16" r={radius * 1.25} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e0634a" />
          <stop offset="0.55" stopColor="#c03b25" />
          <stop offset="1" stopColor="#8b2314" />
        </radialGradient>
      </defs>
      <path d={edge} fill={`url(#${g})`} />
      <path d={edge} fill="none" stroke="#6e170c" strokeOpacity="0.5" strokeWidth="2.6" />
      <path d={rim} fill="none" stroke="#f08a6c" strokeOpacity="0.28" strokeWidth="1.6" />
      {variant === 1 && <path d="M18 34 A44 44 0 0 0 40 8" fill="none" stroke="#5a1409" strokeOpacity="0.38" strokeWidth="7" strokeLinecap="round" />}
      <path d={fat} fill="#f6cdb8" fillOpacity="0.78" />
      <path d={pepper} fill="#4a0f06" fillOpacity="0.6" />
      <path d="M-30 -24 A38 38 0 0 1 8 -38" fill="none" stroke="#fff" strokeOpacity="0.34" strokeWidth="5" strokeLinecap="round" />
      <Sparkle x={-22} y={-30} />
    </>
  );
}

export const curedArt: IngredientArt[] = [
  {
    slug: 'salame-piccante',
    sizeCm: 5.6,
    density: 11,
    scatter: 'discrete',
    layer: 40,
    variants: 3,
    rotation: 'free',
    scaleJitter: 0.1,
    Piece: SalamePiccante,
  },
];
