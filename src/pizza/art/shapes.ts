import { createRng } from '../rng';

/**
 * Small SVG toolkit shared by the pizza base and every ingredient piece. All shapes are deterministic functions of a
 * seed string, so art never flickers between renders or between server and browser.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Dot {
  x: number;
  y: number;
  r: number;
}

const f = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Round to 2 decimals. Math.sin/cos/pow differ in the last digits between Node and the browser, so EVERY computed
 * number that reaches the DOM must be rounded here, or React reports a hydration mismatch and discards the server HTML.
 */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Closed Catmull-Rom spline through the points, as an SVG path of cubic Béziers (without the trailing Z). */
export function smoothClosedPath(points: readonly Pt[], tension = 0.5): string {
  const n = points.length;
  const k = tension / 3;
  let d = `M${f(points[0]!.x)} ${f(points[0]!.y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    d += `C${f(p1.x + (p2.x - p0.x) * k)} ${f(p1.y + (p2.y - p0.y) * k)} ${f(p2.x - (p3.x - p1.x) * k)} ${f(p2.y - (p3.y - p1.y) * k)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** A slightly irregular closed blob around the origin: `wobble` is the radius variation (0.08 = ±8%). */
export function blobPath(radius: number, wobble: number, seed: string, points = 14, squash = 1): string {
  const rng = createRng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 + (rng.next() * 2 - 1) * wobble);
    pts.push({ x: Math.cos(a) * r * squash, y: Math.sin(a) * r });
  }
  return `${smoothClosedPath(pts)}Z`;
}

/** Straight-segment outline of a circle with smooth low-frequency wobble (cheap, for big shapes like the crust). */
export function waveOutline(radius: number, amplitude: number, seed: string, steps = 180): Pt[] {
  const rng = createRng(seed);
  const waves = [3, 5, 8, 13, 21].map((k) => ({ k, a: (amplitude / Math.sqrt(k)) * rng.range(0.6, 1.2), p: rng.range(0, Math.PI * 2) }));
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    let r = radius;
    for (const w of waves) r += w.a * Math.sin(w.k * t + w.p);
    pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
  }
  return pts;
}

export function polygonPath(points: readonly Pt[]): string {
  return `M${points.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`;
}

/** Many small circles as ONE path: draws hundreds of specks with a single DOM node. */
export function dotsPath(dots: readonly Dot[]): string {
  return dots.map((d) => `M${f(d.x - d.r)} ${f(d.y)}a${f(d.r)} ${f(d.r)} 0 1 0 ${f(d.r * 2)} 0a${f(d.r)} ${f(d.r)} 0 1 0 ${f(-d.r * 2)} 0Z`).join('');
}

/** `count` dots spread uniformly (by area) inside the annulus [innerRadius, outerRadius]. */
export function scatterDots(seed: string, count: number, outerRadius: number, rMin: number, rMax: number, innerRadius = 0): Dot[] {
  const rng = createRng(seed);
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.range(innerRadius ** 2, outerRadius ** 2));
    dots.push({ x: r2(Math.cos(a) * rad), y: r2(Math.sin(a) * rad), r: r2(rng.range(rMin, rMax)) });
  }
  return dots;
}

export function polar(angleRad: number, radius: number): Pt {
  return { x: r2(Math.cos(angleRad) * radius), y: r2(Math.sin(angleRad) * radius) };
}

export { f as fmt };
