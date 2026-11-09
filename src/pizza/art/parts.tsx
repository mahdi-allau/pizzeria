import type { ReactElement } from 'react';

/**
 * Building blocks for ingredient art. Pieces are drawn in a 100×100 box centred on (0,0), light from the top-left.
 * No SVG filters anywhere in a piece: depth comes from gradients, opacity and offset copies.
 */

/** Soft contact shadow, faked with two stacked translucent ellipses (no blur filter). */
export function Shadow({ rx, ry = rx, dx = 2.6, dy = 3.8, o = 0.3 }: { rx: number; ry?: number; dx?: number; dy?: number; o?: number }): ReactElement {
  return (
    <g fill="#1a0a04">
      <ellipse cx={dx} cy={dy} rx={rx + 1.6} ry={ry + 1.6} opacity={o * 0.45} />
      <ellipse cx={dx * 0.8} cy={dy * 0.8} rx={rx} ry={ry} opacity={o} />
    </g>
  );
}

/** A small specular dot, the "wet" sparkle that makes food look fresh. */
export function Sparkle({ x, y, r = 2.2, o = 0.55 }: { x: number; y: number; r?: number; o?: number }): ReactElement {
  return <circle cx={x} cy={y} r={r} fill="#fff" fillOpacity={o} />;
}

/** Namespaced id helper: `idFor(uid, 'sal', variant, 'g')` → "pz1-sal-0-g". */
export function idFor(uid: string, ...parts: Array<string | number>): string {
  return [uid, ...parts].join('-');
}
