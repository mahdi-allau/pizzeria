import { PIZZA_RADIUS, doughLook, sauceLook, sauceRadius } from './geometry';
import { createRng } from './rng';
import { type Dot, type Pt, dotsPath, fmt, polygonPath, r2, scatterDots, waveOutline } from './art/shapes';

/**
 * Pre-computed decoration of the pizza base (board grain, crust outline, leopard spots, flour, sauce swirl...).
 * Pure and cached per (seed, dough, sauce): re-rendering the pizza while toppings change never recomputes it.
 */

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
}

export interface BaseArt {
  crustWidth: number;
  innerR: number;
  sauceR: number;
  grain: Array<{ d: string; w: number; o: number }>;
  crustRing: string;
  doughDisc: string;
  spots: Ellipse[];
  /** Big charred blotches on the outer edge of the crust. */
  chars: Ellipse[];
  /** Soft colour unevenness of a real bake. */
  mottle: { light: Ellipse[]; dark: Ellipse[] };
  flour: string;
  bran: string;
  bubbles: Dot[];
  sauce:
    | { kind: 'tomato'; edge: string; swirl: string; swirlShadow: string; seeds: string; herbs: string; droplets: string; pools: Ellipse[]; pulp: { light: Ellipse[]; dark: Ellipse[] }; gloss: Ellipse[] }
    | { kind: 'white'; edge: string; sheens: Ellipse[]; beads: Dot[]; needles: Array<{ x1: number; y1: number; x2: number; y2: number }>; garlic: Ellipse[]; pepper: string }
    | { kind: 'none'; edge: string; blotches: Ellipse[]; flour: string };
}

const TAU = Math.PI * 2;
const cache = new Map<string, BaseArt>();

function ellipsesOnRing(seed: string, count: number, rIn: number, rOut: number, rxRange: [number, number], ryRange: [number, number], bias = 0.6): Ellipse[] {
  const rng = createRng(seed);
  const out: Ellipse[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.next() * TAU;
    // bias > 0 pushes the spots towards the outer edge, where a real crust chars the most.
    const r = rIn + (rOut - rIn) * rng.next() ** (1 - bias * 0.7);
    out.push({
      cx: r2(Math.cos(a) * r),
      cy: r2(Math.sin(a) * r),
      rx: r2(rng.range(...rxRange)),
      ry: r2(rng.range(...ryRange)),
      rot: r2((a * 180) / Math.PI + 90 + rng.range(-25, 25)),
    });
  }
  return out;
}

function ellipsesInDisc(seed: string, count: number, radius: number, rxRange: [number, number], ryRange: [number, number]): Ellipse[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const a = rng.next() * TAU;
    const r = radius * Math.sqrt(rng.next());
    return { cx: r2(Math.cos(a) * r), cy: r2(Math.sin(a) * r), rx: r2(rng.range(...rxRange)), ry: r2(rng.range(...ryRange)), rot: r2(rng.range(0, 180)) };
  });
}

/** Spiral from the centre outwards, like a ladle swirl of sauce. */
function spiralPath(turns: number, maxR: number, seed: string, phase = 0): string {
  const rng = createRng(seed);
  const steps = 140;
  const wob = rng.range(0.6, 1.4);
  const pts: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = phase + t * turns * TAU;
    const r = maxR * t * (1 + 0.04 * Math.sin(t * 17 * wob));
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return `M${pts.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}`;
}

export function buildBaseArt(seed: string, doughSlug: string, sauceSlug: string): BaseArt {
  const key = `${seed}|${doughSlug}|${sauceSlug}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const look = doughLook(doughSlug);
  const sauceKind = sauceLook(sauceSlug).kind;
  const innerR = PIZZA_RADIUS - look.crustWidth;
  const sauceR = sauceRadius(look.crustWidth);
  const rng = createRng(`${seed}|base`);

  // Board grain: a few long, faint arcs.
  const grain = Array.from({ length: 9 }, (_, i) => {
    const r = rng.range(140, 470);
    const a0 = rng.range(0, TAU);
    const sweep = rng.range(0.7, 2.4);
    const x0 = Math.cos(a0) * r;
    const y0 = Math.sin(a0) * r;
    const x1 = Math.cos(a0 + sweep) * r;
    const y1 = Math.sin(a0 + sweep) * r;
    return { d: `M${fmt(x0)} ${fmt(y0)}A${fmt(r)} ${fmt(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${fmt(x1)} ${fmt(y1)}`, w: 1 + (i % 3), o: 0.1 + (i % 4) * 0.035 };
  });

  const outer = waveOutline(PIZZA_RADIUS, 7 * look.irregularity, `${seed}|crust-o`);
  const inner = waveOutline(innerR, 4 * look.irregularity, `${seed}|crust-i`);
  const crustRing = `${polygonPath(outer)}${polygonPath(inner)}`;
  const doughDisc = polygonPath(waveOutline(innerR + 6, 3, `${seed}|dough`, 120));

  const spots = ellipsesOnRing(`${seed}|spots`, look.spots, innerR + 6, PIZZA_RADIUS - 5, [5, 15], [3, 8]);
  const chars = look.kind === 'glutenfree' ? [] : ellipsesOnRing(`${seed}|chars`, 7, PIZZA_RADIUS - 26, PIZZA_RADIUS - 8, [16, 30], [5, 9], 0.9);
  const mottle = {
    light: ellipsesOnRing(`${seed}|mottle-l`, 22, innerR + 4, PIZZA_RADIUS - 4, [16, 38], [8, 16], 0),
    dark: ellipsesOnRing(`${seed}|mottle-d`, 22, innerR + 4, PIZZA_RADIUS - 4, [16, 38], [8, 16], 0),
  };
  const flour = dotsPath(scatterDots(`${seed}|flour`, 90, PIZZA_RADIUS - 4, 0.7, 2, innerR + 2));
  const bran = look.bran > 0 ? dotsPath(scatterDots(`${seed}|bran`, look.bran, PIZZA_RADIUS - 4, 0.9, 2.6, innerR + 2)) : '';
  const bubbles = scatterDots(`${seed}|bubbles`, look.bubbles, PIZZA_RADIUS - 14, 5, 13, innerR + 12);

  let sauce: BaseArt['sauce'];
  const edge = polygonPath(waveOutline(sauceR, 6, `${seed}|sauce-edge`, 150));

  if (sauceKind === 'tomato') {
    sauce = {
      kind: 'tomato',
      edge,
      swirl: spiralPath(3.1, sauceR - 36, `${seed}|swirl`, rng.range(0, TAU)),
      swirlShadow: spiralPath(3.1, sauceR - 26, `${seed}|swirl`, rng.range(0, TAU)),
      seeds: dotsPath(scatterDots(`${seed}|seeds`, 55, sauceR - 8, 0.9, 2.2)),
      herbs: dotsPath(scatterDots(`${seed}|herbs`, 34, sauceR - 8, 1.2, 2.6)),
      droplets: dotsPath(scatterDots(`${seed}|drops`, 22, sauceR - 20, 2, 5)),
      pools: ellipsesInDisc(`${seed}|pools`, 9, sauceR - 40, [26, 70], [14, 34]),
      pulp: {
        light: ellipsesInDisc(`${seed}|pulp-l`, 40, sauceR - 16, [9, 26], [4, 11]),
        dark: ellipsesInDisc(`${seed}|pulp-d`, 34, sauceR - 16, [8, 22], [4, 10]),
      },
      gloss: [
        { cx: r2(-sauceR * 0.34), cy: r2(-sauceR * 0.38), rx: r2(sauceR * 0.3), ry: r2(sauceR * 0.1), rot: -35 },
        { cx: r2(sauceR * 0.28), cy: r2(sauceR * 0.32), rx: r2(sauceR * 0.16), ry: r2(sauceR * 0.05), rot: -35 },
      ],
    };
  } else if (sauceKind === 'white') {
    const needleRng = createRng(`${seed}|needles`);
    sauce = {
      kind: 'white',
      edge,
      sheens: ellipsesInDisc(`${seed}|sheens`, 11, sauceR - 50, [30, 90], [8, 22]),
      beads: scatterDots(`${seed}|beads`, 18, sauceR - 20, 5, 16),
      needles: Array.from({ length: 30 }, () => {
        const a = needleRng.next() * TAU;
        const r = (sauceR - 14) * Math.sqrt(needleRng.next());
        const rot = needleRng.next() * TAU;
        const len = needleRng.range(8, 17);
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        return { x1: r2(cx), y1: r2(cy), x2: r2(cx + Math.cos(rot) * len), y2: r2(cy + Math.sin(rot) * len) };
      }),
      garlic: ellipsesInDisc(`${seed}|garlic`, 9, sauceR - 30, [6, 11], [3.5, 6]),
      pepper: dotsPath(scatterDots(`${seed}|pepper`, 22, sauceR - 10, 0.8, 1.8)),
    };
  } else {
    sauce = {
      kind: 'none',
      edge,
      blotches: ellipsesInDisc(`${seed}|blotch`, 16, innerR - 20, [10, 40], [6, 20]),
      flour: dotsPath(scatterDots(`${seed}|dust`, 140, innerR - 6, 0.7, 2)),
    };
  }

  const art: BaseArt = { crustWidth: look.crustWidth, innerR, sauceR, grain, crustRing, doughDisc, spots, chars, mottle, flour, bran, bubbles, sauce };
  if (cache.size > 60) cache.clear();
  cache.set(key, art);
  return art;
}
