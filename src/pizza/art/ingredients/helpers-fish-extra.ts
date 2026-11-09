import { createRng } from '../../rng';
import { fmt, r2, type Pt } from '../shapes';

/**
 * Small geometry helpers used only by fish.tsx and extra.tsx. Every coordinate they return is rounded with r2, so the
 * markup is identical in Node and the browser (Math.sin/cos differ in the last digits between engines).
 */

/** Open Catmull-Rom spline through the points, as an SVG path (M…C…). */
export function smoothOpenPath(points: readonly Pt[], tension = 0.5): string {
  const n = points.length;
  const k = tension / 3;
  const at = (i: number) => points[Math.max(0, Math.min(n - 1, i))]!;
  let d = `M${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${fmt(p1.x + (p2.x - p0.x) * k)} ${fmt(p1.y + (p2.y - p0.y) * k)} ${fmt(p2.x - (p3.x - p1.x) * k)} ${fmt(p2.y - (p3.y - p1.y) * k)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

/** Unit normal of a polyline at point i (left-hand side of the direction of travel). */
function normalAt(center: readonly Pt[], i: number): Pt {
  const n = center.length;
  const a = center[Math.max(0, i - 1)]!;
  const b = center[Math.min(n - 1, i + 1)]!;
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: -ty / len, y: tx / len };
}

/** A line running parallel to `center`, offset sideways by `offset(t)` (t = 0…1 along the line). */
export function offsetLine(center: readonly Pt[], offset: (t: number) => number, from = 0, to = 1): Pt[] {
  const n = center.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (t < from - 1e-9 || t > to + 1e-9) continue;
    const nn = normalAt(center, i);
    const o = offset(t);
    out.push({ x: r2(center[i]!.x + nn.x * o), y: r2(center[i]!.y + nn.y * o) });
  }
  return out;
}

/** Closed outline of a ribbon of half-width `halfWidth(t)` around a centre line. */
export function ribbonOutline(center: readonly Pt[], halfWidth: (t: number) => number): Pt[] {
  const left = offsetLine(center, halfWidth);
  const right = offsetLine(center, (t) => -halfWidth(t));
  return [...left, ...right.reverse()];
}

/** Scale points about a pivot. */
export function scalePts(points: readonly Pt[], sx: number, sy = sx, cx = 0, cy = 0): Pt[] {
  return points.map((p) => ({ x: r2(cx + (p.x - cx) * sx), y: r2(cy + (p.y - cy) * sy) }));
}

/** Jitter each point by up to ±amount, deterministically. */
export function jitterPts(points: readonly Pt[], amount: number, seed: string): Pt[] {
  const rng = createRng(seed);
  return points.map((p) => ({ x: r2(p.x + rng.range(-amount, amount)), y: r2(p.y + rng.range(-amount, amount)) }));
}

/** An irregular, angular shard (a flake / crumb) as a straight-edged polygon path. */
export function shardPath(seed: string, cx: number, cy: number, radius: number, sides = 5, elongation = 1, angle = 0): string {
  const rng = createRng(seed);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((i + rng.range(-0.3, 0.3)) / sides) * Math.PI * 2;
    const r = radius * rng.range(0.6, 1.1);
    const lx = Math.cos(a) * r * elongation;
    const ly = Math.sin(a) * r;
    pts.push(`${fmt(cx + lx * ca - ly * sa)} ${fmt(cy + lx * sa + ly * ca)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Point at `angle` (radians) on a circle of `radius` around (cx, cy), rounded. */
export function onCircle(cx: number, cy: number, radius: number, angle: number): Pt {
  return { x: r2(cx + Math.cos(angle) * radius), y: r2(cy + Math.sin(angle) * radius) };
}

export const deg = (d: number) => (d * Math.PI) / 180;
