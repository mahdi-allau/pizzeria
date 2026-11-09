import { createRng } from '../../rng';
import { r2, smoothClosedPath, type Pt } from '../shapes';

/**
 * Small geometry helpers for the cheese and cured-meat pieces (ribbons, curls, crumbles, tiny cubes, seeds).
 * Every number that reaches the markup is rounded with r2 (hydration safety).
 */

const pt = (x: number, y: number): Pt => ({ x: r2(x), y: r2(y) });

/** Open Catmull-Rom spline through the points (for veins, fat lines, highlights). */
export function openSmoothPath(points: readonly Pt[], tension = 0.5): string {
  const n = points.length;
  const k = tension / 3;
  let d = `M${r2(points[0]!.x)} ${r2(points[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;
    d += `C${r2(p1.x + (p2.x - p0.x) * k)} ${r2(p1.y + (p2.y - p0.y) * k)} ${r2(p2.x - (p3.x - p1.x) * k)} ${r2(p2.y - (p3.y - p1.y) * k)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return d;
}

/** Sample a parametric curve t∈[0,1] into n points. */
export function sampleCurve(n: number, fn: (t: number) => { x: number; y: number }): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const p = fn(i / (n - 1));
    return pt(p.x, p.y);
  });
}

export interface Band {
  /** Closed outline (left edge forward, right edge back), ready for smoothClosedPath. */
  outline: Pt[];
  /** Points at a fraction of the half-width across the band: -1 = right edge, 0 = centre, 1 = left edge. */
  line: (frac: number, from?: number, to?: number) => Pt[];
  left: Pt[];
  right: Pt[];
  center: readonly Pt[];
}

/** A band of varying width around a centreline: ham ribbons, speck strips, parmesan curls. */
export function band(center: readonly Pt[], halfWidth: (t: number, i: number) => number): Band {
  const n = center.length;
  const normals = center.map((_, i) => {
    const a = center[Math.max(0, i - 1)]!;
    const b = center[Math.min(n - 1, i + 1)]!;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: -ty / len, y: tx / len };
  });
  const widths = center.map((_, i) => halfWidth(i / (n - 1), i));
  const line = (frac: number, from = 0, to = n - 1) => {
    const out: Pt[] = [];
    for (let i = from; i <= to; i++) out.push(pt(center[i]!.x + normals[i]!.x * widths[i]! * frac, center[i]!.y + normals[i]!.y * widths[i]! * frac));
    return out;
  };
  const left = line(1);
  const right = line(-1);
  return { outline: [...left, ...[...right].reverse()], line, left, right, center };
}

export const closed = (points: readonly Pt[], tension = 0.5) => `${smoothClosedPath(points, tension)}Z`;

/** Tiny irregular quadrilaterals as ONE path (mortadella fat cubes, cheese crystals). */
export function quadsPath(seed: string, count: number, radius: number, sMin: number, sMax: number, inner = 0): string {
  const rng = createRng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.range(inner ** 2, radius ** 2));
    const cx = Math.cos(a) * rad;
    const cy = Math.sin(a) * rad;
    const s = rng.range(sMin, sMax) / 2;
    const rot = rng.next() * Math.PI;
    const corners = [0, 1, 2, 3].map((k) => {
      const ang = rot + (k * Math.PI) / 2 + rng.range(-0.25, 0.25);
      const rr = s * Math.SQRT2 * rng.range(0.8, 1.1);
      return pt(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    });
    d += `M${corners.map((c) => `${c.x} ${c.y}`).join('L')}Z`;
  }
  return d;
}

/** Short strokes as ONE path (fennel seeds, cheese grain, stracciatella strands). */
export function strokesPath(seed: string, count: number, radius: number, lMin: number, lMax: number, curl = 0, cx = 0, cy = 0, inner = 0): string {
  const rng = createRng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.range(inner ** 2, radius ** 2));
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    const dir = rng.next() * Math.PI * 2;
    const l = rng.range(lMin, lMax);
    const ex = x + Math.cos(dir) * l;
    const ey = y + Math.sin(dir) * l;
    const bend = rng.range(-curl, curl);
    const mx = (x + ex) / 2 - Math.sin(dir) * bend;
    const my = (y + ey) / 2 + Math.cos(dir) * bend;
    d += `M${r2(x)} ${r2(y)}Q${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`;
  }
  return d;
}

/** Wavy open lines crossing a shape (blue veins in gorgonzola, marbling in crudo). */
export function veinsPath(seed: string, count: number, span: number, wobble: number, segments = 6): string {
  const rng = createRng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const ang = rng.next() * Math.PI;
    const off = rng.range(-span * 0.6, span * 0.6);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const len = rng.range(span * 0.5, span * 1.1);
    const start = rng.range(-span * 0.6, span * 0.2);
    const pts: Pt[] = [];
    for (let s = 0; s <= segments; s++) {
      const u = start + (len * s) / segments;
      const v = off + rng.range(-wobble, wobble);
      pts.push(pt(u * ca - v * sa, u * sa + v * ca));
    }
    d += openSmoothPath(pts);
  }
  return d;
}

/** Irregular polygon-ish blob points (for chunks with flatter facets than blobPath). */
export function chunkPoints(seed: string, radius: number, wobble: number, points: number, squash = 1, rot = 0): Pt[] {
  const rng = createRng(seed);
  return Array.from({ length: points }, (_, i) => {
    const a = rot + (i / points) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = radius * (1 + rng.range(-wobble, wobble));
    return pt(Math.cos(a) * r * squash, Math.sin(a) * r);
  });
}
