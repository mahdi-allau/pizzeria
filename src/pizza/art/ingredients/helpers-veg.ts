import { createRng } from '../../rng';
import { r2, smoothClosedPath, type Dot, type Pt } from '../shapes';

/**
 * Geometry helpers for the vegetable pieces (veg.tsx). Every number that leaves here is rounded to 2 decimals, so the
 * markup is identical on the server and in the browser (Math.sin/cos differ in the last digits between engines).
 */

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point at `deg` degrees on a circle of radius `r` around (cx, cy), rounded. */
export function onCircle(cx: number, cy: number, r: number, deg: number): Pt {
  return { x: r2(cx + Math.cos(rad(deg)) * r), y: r2(cy + Math.sin(rad(deg)) * r) };
}

/** An open SVG arc from angle a0 to a1 (degrees) on a circle around (cx, cy). */
export function arcD(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = onCircle(cx, cy, r, a0);
  const p1 = onCircle(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${p0.x} ${p0.y}A${r2(r)} ${r2(r)} 0 ${large} ${sweep} ${p1.x} ${p1.y}`;
}

export interface BandOptions {
  cx: number;
  cy: number;
  /** Radius of the band's centre line. */
  R: number;
  /** Half the band's width. */
  hw: number;
  /** Start / end angle in degrees (a0 < a1). */
  a0: number;
  a1: number;
  seed: string;
  /** Edge irregularity as a fraction of hw. */
  wobble?: number;
  /** 0 = constant width, 1 = ends pinch to nothing. */
  taper?: number;
  steps?: number;
}

/**
 * A curved strip (pepper strip, onion ring, potato stick): the outline of an annulus segment with rounded ends and a
 * slightly irregular edge. Returns a closed, smooth path.
 */
export function arcBand({ cx, cy, R, hw, a0, a1, seed, wobble = 0.08, taper = 0.25, steps = 10 }: BandOptions): string {
  const rng = createRng(seed);
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const w = hw * (1 - taper * (1 - Math.sin(Math.PI * t)));
    outer.push(onCircle(cx, cy, R + w * (1 + (rng.next() * 2 - 1) * wobble), a));
    inner.push(onCircle(cx, cy, R - w * (1 + (rng.next() * 2 - 1) * wobble), a));
  }
  const cap = ((hw * 0.8) / R) * (180 / Math.PI);
  const pts = [...outer, onCircle(cx, cy, R, a1 + cap), ...inner.reverse(), onCircle(cx, cy, R, a0 - cap)];
  return `${smoothClosedPath(pts, 0.45)}Z`;
}

/** `count` dots scattered along a band, near its edges (`edge` = 1) or anywhere across it (`edge` = 0). */
export function bandDots(
  seed: string,
  count: number,
  o: { cx: number; cy: number; R: number; hw: number; a0: number; a1: number },
  rMin: number,
  rMax: number,
  edge = 0.6,
): Dot[] {
  const rng = createRng(seed);
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(o.a0, o.a1);
    const side = rng.next() < 0.5 ? -1 : 1;
    const off = side * o.hw * rng.range(edge * 0.8, Math.min(1, edge * 0.8 + 0.5));
    const p = onCircle(o.cx, o.cy, o.R + off, a);
    dots.push({ x: p.x, y: p.y, r: r2(rng.range(rMin, rMax)) });
  }
  return dots;
}

/** A radial gradient offset for radius `r` inside a gradient of radius `outer`, clamped to [0, 1]. */
export const off = (r: number, outer: number) => r2(Math.min(1, Math.max(0, r / outer)));

/**
 * A lobed rocket (arugula) leaf along the y axis, base at (0, len/2) and tip at (0, -len/2): pinnate lobes that grow
 * toward a rounded terminal lobe.
 */
export function rocketLeaf(len: number, width: number, lobes: number, seed: string): string {
  const rng = createRng(seed);
  const n = lobes * 4 + 4;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n; // 0 = base, 1 = tip
    const y = len / 2 - t * len;
    const envelope = Math.sin(Math.PI * Math.pow(t, 0.75)) * (0.35 + 0.65 * t);
    const lobe = t > 0.78 ? 1 : 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(Math.PI * lobes * t)), 0.6);
    const w = (width / 2) * envelope * lobe;
    left.push({ x: r2(-w * rng.range(0.85, 1.12)), y: r2(y + rng.range(-1, 1)) });
    right.push({ x: r2(w * rng.range(0.85, 1.12)), y: r2(y + rng.range(-1, 1) - 1.5) });
  }
  const pts: Pt[] = [{ x: 0, y: r2(len / 2) }, ...right, { x: 0, y: r2(-len / 2) }, ...left.reverse()];
  return `${smoothClosedPath(pts, 0.5)}Z`;
}
