import type { ReactElement } from 'react';

/** How pieces of an ingredient are put on the pizza. */
export type ScatterStyle =
  /** Separate pieces spread evenly (pepperoni, mushrooms, olives...). */
  | 'discrete'
  /** Many tiny specks (oregano, chilli flakes, pistachio crumbs). */
  | 'sprinkle'
  /** One big piece near the middle, more portions fan out around it (burrata, egg). */
  | 'center'
  /** A continuous line pattern drawn from the seed (olive oil). */
  | 'drizzle'
  /** The melted mozzarella layer: a metaball contour, not separate pieces. */
  | 'melt';

export type RotationMode = 'free' | 'limited' | 'none';

export interface PieceProps {
  /** 0 … variants-1. */
  variant: number;
  /** Unique per canvas. Namespace every gradient / clip id you define with it. */
  uid: string;
}

export interface LayerProps {
  uid: string;
  seed: string;
  portions: number;
  /** Radius of the sauce disc, in drawing units. Draw inside it (centred on 0,0). */
  radius: number;
}

/**
 * The art for one ingredient. Pieces are drawn in a 100×100 box centred on (0,0); `sizeCm` says how wide that box is
 * in real life, and the engine scales it to the pizza. See docs/design-direction.md for the style guide.
 */
export interface IngredientArt {
  slug: string;
  sizeCm: number;
  /** Pieces per portion on a 30 cm pizza. */
  density: number;
  scatter: ScatterStyle;
  /** Draw order: higher goes on top. Default by category: see `defaultLayer` in art/registry. */
  layer: number;
  variants: number;
  rotation?: 'free' | 'limited' | 'none';
  /** Random size variation, e.g. 0.12 = ±12%. */
  scaleJitter?: number;
  /** The SVG content of one piece (no <svg> wrapper), including its soft contact shadow. */
  Piece: (props: PieceProps) => ReactElement;
  /** Only for `scatter: 'drizzle'`: draws the whole continuous pattern instead of separate pieces. */
  Layer?: (props: LayerProps) => ReactElement;
}
