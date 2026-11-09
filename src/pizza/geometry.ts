/**
 * Drawing space. Everything is drawn in a 1000 × 1000 viewBox with the pizza centred on (500, 500); the SVG is then
 * scaled by CSS, so the same drawing works at thumbnail and hero size.
 */

export const VIEW_SIZE = 1000;
export const CENTER = 500;
/** The round wooden board under the pizza. */
export const BOARD_RADIUS = 488;
/** Outer edge of the crust. */
export const PIZZA_RADIUS = 436;
/** Gap between the inner edge of the crust and the sauce. */
export const SAUCE_GAP = 8;

export type DoughKind = 'classic' | 'wholegrain' | 'glutenfree';

export interface DoughLook {
  kind: DoughKind;
  /** Width of the raised crust ring (drawing units). */
  crustWidth: number;
  /** How wobbly the crust outline is (1 = default). */
  irregularity: number;
  /** Charred "leopard" spots on the crust and their opacity. */
  spots: number;
  spotOpacity: number;
  /** Bran flecks (wholegrain only). */
  bran: number;
  /** Air bubbles on the crust. */
  bubbles: number;
  crust: { light: string; mid: string; dark: string };
  base: { light: string; dark: string };
}

const DOUGH_LOOKS: Record<DoughKind, DoughLook> = {
  classic: {
    kind: 'classic',
    crustWidth: 66,
    irregularity: 1,
    spots: 90,
    spotOpacity: 0.62,
    bran: 0,
    bubbles: 10,
    crust: { light: '#f3bf68', mid: '#e29b3d', dark: '#a85a22' },
    base: { light: '#efd29b', dark: '#e3bc7c' },
  },
  wholegrain: {
    kind: 'wholegrain',
    crustWidth: 68,
    irregularity: 1.2,
    spots: 100,
    spotOpacity: 0.55,
    bran: 140,
    bubbles: 5,
    crust: { light: '#dcaa5e', mid: '#bd8038', dark: '#86521e' },
    base: { light: '#d8b27a', dark: '#c19a62' },
  },
  glutenfree: {
    kind: 'glutenfree',
    crustWidth: 74,
    irregularity: 0.6,
    spots: 40,
    spotOpacity: 0.4,
    bran: 0,
    bubbles: 12,
    crust: { light: '#f7dc94', mid: '#e9bd62', dark: '#c0883a' },
    base: { light: '#f2dca4', dark: '#e8c98a' },
  },
};

/** Looks are keyed by the seeded dough slugs; anything unknown (a dough added later in the admin) looks classic. */
export function doughLook(slug: string): DoughLook {
  if (slug === 'integrale') return DOUGH_LOOKS.wholegrain;
  if (slug === 'senza-glutine') return DOUGH_LOOKS.glutenfree;
  return DOUGH_LOOKS.classic;
}

export type SauceKind = 'tomato' | 'white' | 'none';
export interface SauceLook {
  kind: SauceKind;
}

const SAUCE_LOOKS: Record<SauceKind, SauceLook> = {
  tomato: { kind: 'tomato' },
  white: { kind: 'white' },
  none: { kind: 'none' },
};

export function sauceLook(slug: string): SauceLook {
  if (slug === 'bianca') return SAUCE_LOOKS.white;
  if (slug === 'nessuna') return SAUCE_LOOKS.none;
  return SAUCE_LOOKS.tomato;
}

export function sauceRadius(crustWidth: number): number {
  return PIZZA_RADIUS - crustWidth - SAUCE_GAP;
}

/** Drawing units per real-world centimetre on a pizza of the given diameter. */
export function unitsPerCm(diameterCm: number): number {
  return (2 * PIZZA_RADIUS) / diameterCm;
}

/**
 * Visual size of the whole pizza, so choosing "Grande" really looks bigger. Maps the smallest..largest catalog
 * diameter to 0.78..1 of the available stage.
 */
export function visualScale(diameterCm: number, diameters: readonly number[]): number {
  const min = Math.min(...diameters);
  const max = Math.max(...diameters);
  if (max === min) return 1;
  return 0.78 + (0.22 * (diameterCm - min)) / (max - min);
}
