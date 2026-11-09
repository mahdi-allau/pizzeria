import type { IngredientArt } from '../../types';

/**
 * Formaggi (cheeses). `mozzarella` is the melted layer: its look lives in components/PizzaBase (a metaball contour),
 * so its Piece is intentionally empty. Other cheeses are separate pieces (slices, crumbles, cubes, dollops...).
 */

export const cheeseArt: IngredientArt[] = [
  {
    slug: 'mozzarella',
    sizeCm: 1,
    density: 1,
    scatter: 'melt',
    layer: 10,
    variants: 1,
    Piece: () => <g />,
  },
];
