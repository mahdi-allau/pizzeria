/**
 * Metaball contour → SVG path. Used for the melted mozzarella: soft, merging patches with no runtime SVG filter,
 * so the cheese layer is just a path (cheap to paint, easy to animate with opacity).
 *
 * Field: each blob contributes 0.5·(r/d)², so an isolated blob's outline (threshold 0.5) has radius ≈ r, and nearby
 * blobs add up and bridge the gap like stretching cheese. The outline is extracted with marching squares, stitched
 * into closed loops, and smoothed with Chaikin corner cutting.
 */

export interface Blob {
  x: number;
  y: number;
  /** Visual radius when alone. */
  r: number;
}

export interface MetaballOptions {
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Grid cell size. Smaller = smoother but slower. */
  cell: number;
  /** Field level of the outline (default 0.5 ≈ radius r). Higher = tighter. */
  threshold?: number;
  /** Chaikin smoothing passes (default 2). */
  smooth?: number;
}

type Pt = { x: number; y: number };

// Marching-squares edge pairs per case. Corners: a=top-left b=top-right c=bottom-right d=bottom-left.
// Edges: T(op) R(ight) B(ottom) L(eft). Case index = 8a + 4b + 2c + d ("inside" = field ≥ threshold).
const T = 0;
const R = 1;
const B = 2;
const L = 3;
type EdgePair = readonly [number, number];
const CASES: Record<number, readonly EdgePair[]> = {
  0: [],
  1: [[L, B]],
  2: [[B, R]],
  3: [[L, R]],
  4: [[T, R]],
  6: [[T, B]],
  7: [[L, T]],
  8: [[L, T]],
  9: [[T, B]],
  11: [[T, R]],
  12: [[L, R]],
  13: [[B, R]],
  14: [[L, B]],
  15: [],
};

export function metaballPath(blobs: readonly Blob[], { bounds, cell, threshold = 0.5, smooth = 2 }: MetaballOptions): string {
  if (blobs.length === 0) return '';

  const nx = Math.ceil((bounds.x1 - bounds.x0) / cell);
  const ny = Math.ceil((bounds.y1 - bounds.y0) / cell);
  const stride = nx + 1;
  const field = new Float32Array(stride * (ny + 1));

  for (let j = 1; j < ny; j++) {
    const y = bounds.y0 + j * cell;
    for (let i = 1; i < nx; i++) {
      const x = bounds.x0 + i * cell;
      let sum = 0;
      for (const b of blobs) {
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        sum += (0.5 * b.r * b.r) / (d2 + 1e-6);
      }
      field[j * stride + i] = sum;
    }
  }
  // The outermost ring stays 0, which forces every outline to close inside the bounds.

  const sample = (i: number, j: number) => field[j * stride + i]!;
  const px = (i: number) => bounds.x0 + i * cell;
  const py = (j: number) => bounds.y0 + j * cell;

  // Edge ids: horizontal edge between (i,j)-(i+1,j) = "h:i,j"; vertical edge between (i,j)-(i,j+1) = "v:i,j".
  const edgeKey = (edge: number, i: number, j: number) =>
    edge === T ? `h:${i},${j}` : edge === B ? `h:${i},${j + 1}` : edge === L ? `v:${i},${j}` : `v:${i + 1},${j}`;

  const edgePoint = (key: string): Pt => {
    const horizontal = key.startsWith('h');
    const [i, j] = key.slice(2).split(',').map(Number) as [number, number];
    if (horizontal) {
      const a = sample(i, j);
      const b = sample(i + 1, j);
      const t = (threshold - a) / (b - a);
      return { x: px(i) + t * cell, y: py(j) };
    }
    const a = sample(i, j);
    const b = sample(i, j + 1);
    const t = (threshold - a) / (b - a);
    return { x: px(i), y: py(j) + t * cell };
  };

  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const va = sample(i, j);
      const vb = sample(i + 1, j);
      const vc = sample(i + 1, j + 1);
      const vd = sample(i, j + 1);
      const index = (va >= threshold ? 8 : 0) + (vb >= threshold ? 4 : 0) + (vc >= threshold ? 2 : 0) + (vd >= threshold ? 1 : 0);

      let pairs = CASES[index];
      if (pairs === undefined) {
        // Saddle cells (5 and 10): decide from the cell centre whether the inside corners are connected.
        const connected = (va + vb + vc + vd) / 4 >= threshold;
        if (index === 5) pairs = connected ? [[T, L], [B, R]] : [[T, R], [L, B]];
        else pairs = connected ? [[T, R], [L, B]] : [[L, T], [B, R]];
      }
      for (const [e1, e2] of pairs) link(edgeKey(e1, i, j), edgeKey(e2, i, j));
    }
  }

  // Walk the adjacency graph into closed loops.
  const visited = new Set<string>();
  const loops: Pt[][] = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const loop: Pt[] = [];
    let previous: string | null = null;
    let current: string | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      loop.push(edgePoint(current));
      const neighbours: string[] = adjacency.get(current) ?? [];
      const next: string | undefined = neighbours.find((k) => k !== previous && !visited.has(k));
      previous = current;
      current = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  const smoothed = loops.map((loop) => {
    let points = loop;
    for (let pass = 0; pass < smooth; pass++) {
      const next: Pt[] = [];
      for (let k = 0; k < points.length; k++) {
        const p = points[k]!;
        const q = points[(k + 1) % points.length]!;
        next.push({ x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y }, { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y });
      }
      points = next;
    }
    return points;
  });

  const f = (n: number) => String(Math.round(n * 10) / 10);
  return smoothed.map((pts) => `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`).join('');
}
