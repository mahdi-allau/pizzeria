import type { ReactElement } from 'react';
import { blobPath, dotsPath, polar, r2, scatterDots, type Pt } from '../shapes';
import { Sparkle, idFor } from '../parts';
import { createRng } from '../../rng';
import type { IngredientArt, PieceProps } from '../../types';
import { band, chunkPoints, closed, openSmoothPath, sampleCurve, strokesPath, veinsPath } from './helpers-cheese-cured';

/**
 * Formaggi (cheeses). `mozzarella` is the melted layer: its look lives in components/PizzaBase (a metaball contour),
 * so its Piece is intentionally empty. Other cheeses are separate pieces (slices, crumbles, cubes, dollops...).
 * Layering: contact shadow (offset copy of the silhouette) → melt halo → gradient body → browned/smoked rim (clipped)
 * → texture → specular sheen → Sparkle. Baked cheeses get golden edges; parmigiano and burrata (after bake) stay fresh.
 */

/** Soft contact shadow that follows any silhouette: two offset translucent copies, no blur filter. */
function ShapeShadow({ d, dx = 2.6, dy = 3.8, o = 0.3 }: { d: string; dx?: number; dy?: number; o?: number }): ReactElement {
  return (
    <g fill="#1a0a04">
      <path d={d} transform={`translate(${r2(dx * 1.25)} ${r2(dy * 1.25)})`} opacity={r2(o * 0.45)} stroke="#1a0a04" strokeOpacity="1" strokeWidth="3" strokeLinejoin="round" />
      <path d={d} transform={`translate(${r2(dx)} ${r2(dy)})`} opacity={o} />
    </g>
  );
}

// ── Bufala: soft porcelain rounds and torn pieces ────────────────────────────────
function bufalaOutline(variant: number): { d: string; r: number } {
  if (variant === 1) return { d: blobPath(41, 0.16, 'bufala-1-edge', 10, 0.88), r: 41 };
  if (variant === 2) {
    // half-moon: a rounded dome on top, a softly torn straight-ish edge below
    const rng = createRng('bufala-2-torn');
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = polar(Math.PI + (i / 8) * Math.PI, 44);
      pts.push({ x: p.x, y: r2(p.y + 18) });
    }
    for (let i = 1; i <= 5; i++) pts.push({ x: r2(44 - (88 * i) / 6), y: r2(22 + rng.range(-3.5, 4.5)) });
    return { d: closed(pts), r: 32 };
  }
  if (variant === 3) return { d: blobPath(37, 0.07, 'bufala-3-edge', 12, 0.92), r: 37 };
  return { d: blobPath(44, 0.035, 'bufala-0-edge', 14, 1), r: 44 };
}

function Bufala({ variant, uid }: PieceProps) {
  const { d, r } = bufalaOutline(variant);
  const g = idFor(uid, 'bufala', variant, 'g');
  const c = idFor(uid, 'bufala', variant, 'c');
  const warm = ['#e2cda4', '#dcc59a', '#e6d3ad', '#dfc89f'][variant] ?? '#e2cda4';
  const brown = dotsPath(scatterDots(`bufala-${variant}-brown`, 7, r + 3, 3, 7, r - 5));
  const pores = dotsPath(scatterDots(`bufala-${variant}-pores`, 16, r - 10, 0.5, 1.3));
  const curd = strokesPath(`bufala-${variant}-curd`, 4, r - 14, 10, 18, 3);
  return (
    <>
      <ShapeShadow d={d} o={0.26} />
      <defs>
        <radialGradient id={g} cx="-15" cy="-17" r={r * 1.55} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.38" stopColor="#fdfaf2" />
          <stop offset="0.72" stopColor="#f3ead7" />
          <stop offset="1" stopColor={warm} />
        </radialGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <path d={d} fill="none" stroke="#d7a861" strokeOpacity="0.42" strokeWidth="7" />
        <path d={brown} fill="#c98f45" fillOpacity="0.26" />
        <path d={curd} fill="none" stroke="#e9dcc0" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
        <path d={pores} fill="#e3d4b4" fillOpacity="0.55" />
      </g>
      <path d={d} fill="none" stroke="#b98a4c" strokeOpacity="0.35" strokeWidth="1.4" />
      <ellipse cx="-13" cy="-15" rx={r * 0.42} ry={r * 0.22} transform="rotate(-32 -13 -15)" fill="#fff" fillOpacity="0.55" />
      <path d={`M${r2(-r * 0.7)} ${r2(-r * 0.2)}Q${r2(-r * 0.62)} ${r2(-r * 0.62)} ${r2(-r * 0.18)} ${r2(-r * 0.72)}`} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
      <Sparkle x={-20} y={-24} r={2.4} o={0.8} />
    </>
  );
}

// ── Gorgonzola: creamy crumbles with blue-green veins ────────────────────────────
function Crumble({ uid, variant, part, radius, x = 0, y = 0, rot = 0 }: { uid: string; variant: number; part: number; radius: number; x?: number; y?: number; rot?: number }) {
  const seed = `gorgonzola-${variant}-${part}`;
  const d = closed(chunkPoints(`${seed}-edge`, radius, 0.2, 9, [0.9, 1.08, 0.82, 1][variant] ?? 1, rot), 0.42);
  const g = idFor(uid, 'gorgonzola', variant, part, 'g');
  const c = idFor(uid, 'gorgonzola', variant, part, 'c');
  const veins = veinsPath(`${seed}-veins`, 3, radius, radius * 0.13, 4);
  const blots = dotsPath(scatterDots(`${seed}-blots`, 5, radius * 0.7, radius * 0.08, radius * 0.16));
  const specks = dotsPath(scatterDots(`${seed}-specks`, 11, radius * 0.85, 0.7, 2.1));
  const pits = dotsPath(scatterDots(`${seed}-pits`, 6, radius * 0.75, 1.2, 2.6));
  return (
    <g transform={`translate(${x} ${y})`}>
      <ShapeShadow d={d} o={0.28} dx={2.2} dy={3.2} />
      <defs>
        <radialGradient id={g} cx={r2(-radius * 0.35)} cy={r2(-radius * 0.4)} r={r2(radius * 1.6)} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffaec" />
          <stop offset="0.5" stopColor="#f4e9cc" />
          <stop offset="1" stopColor="#dcc796" />
        </radialGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <path d={blots} fill="#7fa39c" fillOpacity="0.3" />
        <path d={veins} fill="none" stroke="#7fa39c" strokeOpacity="0.4" strokeWidth={r2(radius * 0.22)} strokeLinecap="round" />
        <path d={veins} fill="none" stroke="#3d6676" strokeOpacity="0.55" strokeWidth={r2(radius * 0.05)} strokeLinecap="round" />
        <path d={specks} fill="#28475f" fillOpacity="0.72" />
        <path d={pits} fill="#c9b07a" fillOpacity="0.35" />
        <path d={d} fill="none" stroke="#cfa45e" strokeOpacity="0.3" strokeWidth="5" />
      </g>
      <path d={d} fill="none" stroke="#a88b55" strokeOpacity="0.4" strokeWidth="1.2" strokeLinejoin="round" />
      <ellipse cx={r2(-radius * 0.3)} cy={r2(-radius * 0.38)} rx={r2(radius * 0.36)} ry={r2(radius * 0.17)} transform={`rotate(-30 ${r2(-radius * 0.3)} ${r2(-radius * 0.38)})`} fill="#fff" fillOpacity="0.42" />
      <Sparkle x={r2(-radius * 0.42)} y={r2(-radius * 0.45)} r={1.8} o={0.7} />
    </g>
  );
}

function Gorgonzola({ variant, uid }: PieceProps) {
  if (variant === 3) {
    return (
      <>
        <Crumble uid={uid} variant={3} part={0} radius={28} x={-11} y={-6} />
        <Crumble uid={uid} variant={3} part={1} radius={17} x={22} y={20} rot={0.6} />
      </>
    );
  }
  return <Crumble uid={uid} variant={variant} part={0} radius={[42, 38, 40][variant] ?? 42} rot={variant * 0.4} />;
}

// ── Provola: smoked cubes and slices, glossy melted top ──────────────────────────
function provolaOutline(variant: number): string {
  const rng = createRng(`provola-${variant}-edge`);
  const j = (n: number) => r2(n + rng.range(-2.2, 2.2));
  if (variant === 1) {
    // a long slice
    return closed([{ x: j(-44), y: j(-24) }, { x: j(0), y: j(-27) }, { x: j(44), y: j(-23) }, { x: j(46), y: j(0) }, { x: j(43), y: j(25) }, { x: j(0), y: j(27) }, { x: j(-44), y: j(24) }, { x: j(-46), y: j(0) }], 0.3);
  }
  if (variant === 2) {
    // a wedge chunk
    return closed([{ x: j(-40), y: j(-34) }, { x: j(4), y: j(-38) }, { x: j(42), y: j(-30) }, { x: j(26), y: j(6) }, { x: j(6), y: j(38) }, { x: j(-22), y: j(16) }], 0.32);
  }
  const s = variant === 3 ? 32 : 39;
  return closed([{ x: j(-s), y: j(-s) }, { x: j(0), y: j(-s - 2) }, { x: j(s), y: j(-s) }, { x: j(s + 2), y: j(0) }, { x: j(s), y: j(s) }, { x: j(0), y: j(s + 2) }, { x: j(-s), y: j(s) }, { x: j(-s - 2), y: j(0) }], 0.45);
}

function Provola({ variant, uid }: PieceProps) {
  const d = provolaOutline(variant);
  const g = idFor(uid, 'provola', variant, 'g');
  const c = idFor(uid, 'provola', variant, 'c');
  const rg = idFor(uid, 'provola', variant, 'r');
  const top = ['#fbe8ab', '#f8e2a0', '#fcebb4', '#f6dd96'][variant] ?? '#fbe8ab';
  const blisters = dotsPath(scatterDots(`provola-${variant}-blis`, 7, 30, 1.6, 3.8));
  const bubbles = dotsPath(scatterDots(`provola-${variant}-bub`, 10, 30, 0.7, 1.6));
  return (
    <>
      <ShapeShadow d={d} o={0.3} />
      <path d={d} transform="translate(1.2 1.6) scale(1.07)" fill="#f0cf78" fillOpacity="0.5" />
      <defs>
        <linearGradient id={g} x1="-38" y1="-40" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={top} />
          <stop offset="0.5" stopColor="#efc667" />
          <stop offset="1" stopColor="#d79f45" />
        </linearGradient>
        <linearGradient id={rg} x1="-30" y1="-30" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d9a24c" stopOpacity="0.08" />
          <stop offset="0.55" stopColor="#c98a3c" stopOpacity="0.22" />
          <stop offset="1" stopColor="#97521f" stopOpacity="0.7" />
        </linearGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <path d={d} fill="none" stroke={`url(#${rg})`} strokeWidth="16" />
                <path d={blisters} fill="#c8873a" fillOpacity="0.32" />
        <path d={bubbles} fill="#fff4cf" fillOpacity="0.55" />
      </g>
      <path d={d} fill="none" stroke="#7a4216" strokeOpacity="0.3" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-26 -18Q-18 -28 0 -28" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="4.5" strokeLinecap="round" />
      <ellipse cx="-6" cy="-10" rx="16" ry="7" transform="rotate(-24 -6 -10)" fill="#fff" fillOpacity="0.28" />
      <Sparkle x={-22} y={-22} r={2.2} o={0.75} />
    </>
  );
}

// ── Parmigiano: fresh shavings (after bake), thin curls with grain ───────────────
function parmigianoBand(variant: number) {
  if (variant === 1) {
    const c = sampleCurve(10, (t) => ({ x: -36 + 72 * t, y: 4 + 7 * Math.sin(Math.PI * t * 1.3) - 6 }));
    return band(c, (t) => 9 + 13 * Math.sin(Math.PI * t) ** 0.5);
  }
  if (variant === 2) {
    const c = sampleCurve(13, (t) => ({ x: -42 + 84 * t, y: 15 * Math.sin(2 * Math.PI * t) }));
    return band(c, (t) => 3.5 + 10 * Math.sin(Math.PI * t) ** 0.8);
  }
  if (variant === 3) {
    const c = sampleCurve(8, (t) => ({ x: -28 + 56 * t, y: 10 - 22 * (t - 0.5) ** 2 * 4 + 4 }));
    return band(c, (t) => 3 + 17 * (1 - t) ** 0.8);
  }
  const c = sampleCurve(12, (t) => {
    const a = Math.PI * (1.15 + 0.7 * t);
    return { x: Math.cos(a) * 46, y: Math.sin(a) * 46 + 34 };
  });
  return band(c, (t) => 4 + 12 * Math.sin(Math.PI * t) ** 0.7);
}

function Parmigiano({ variant, uid }: PieceProps) {
  const b = parmigianoBand(variant);
  const d = closed(b.outline);
  const g = idFor(uid, 'parmigiano', variant, 'g');
  const c = idFor(uid, 'parmigiano', variant, 'c');
  const grain = [-0.5, -0.15, 0.2, 0.55].map((f) => openSmoothPath(b.line(f))).join('');
  const crystals = dotsPath(scatterDots(`parmigiano-${variant}-cry`, 12, 40, 0.5, 1.2));
  const pale = ['#fffbe8', '#fff8dc', '#fffcec', '#fff6d6'][variant] ?? '#fffbe8';
  return (
    <>
      <ShapeShadow d={d} dx={3.4} dy={5} o={0.24} />
      <defs>
        <linearGradient id={g} x1="-30" y1="-34" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pale} />
          <stop offset="0.55" stopColor="#f6e6ae" />
          <stop offset="1" stopColor="#e6cd86" />
        </linearGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <path d={openSmoothPath(b.line(-0.9))} fill="none" stroke="#c9a550" strokeOpacity="0.45" strokeWidth="6" strokeLinecap="round" />
        <path d={grain} fill="none" stroke="#d6b964" strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" />
        <path d={crystals} fill="#fff" fillOpacity="0.8" />
      </g>
      <path d={d} fill="none" stroke="#c4a253" strokeOpacity="0.5" strokeWidth="1" strokeLinejoin="round" />
      <path d={openSmoothPath(b.line(0.82))} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.2" strokeLinecap="round" />
    </>
  );
}

// ── Burrata: one creamy dome (after bake), torn top with stracciatella ───────────
function Burrata({ variant, uid }: PieceProps) {
  const R = [41, 40, 45, 39][variant] ?? 41;
  const dome = blobPath(R, 0.025, `burrata-${variant}-dome`, 14);
  const g = idFor(uid, 'burrata', variant, 'g');
  const og = idFor(uid, 'burrata', variant, 'o');
  const oc = idFor(uid, 'burrata', variant, 'c');
  // the tear: an elongated creamy opening that runs from the top of the dome over its rim
  const tear = [
    { angle: 0.75, len: 22, w: 14, dist: 20 },
    { angle: 1.7, len: 25, w: 17, dist: 17 },
    { angle: 0, len: 0, w: 0, dist: 0 },
    { angle: 0.15, len: 27, w: 19, dist: 16 },
  ][variant]!;
  const deg = Math.round((tear.angle * 180) / Math.PI);
  const at = polar(tear.angle, tear.dist);
  const tearPath = blobPath(tear.w, 0.16, `burrata-${variant}-tear`, 11, r2(tear.len / Math.max(1, tear.w)));
  const tearT = `translate(${at.x} ${at.y}) rotate(${deg})`;
  const poolAt = polar(tear.angle, R - 1);
  const pool = blobPath(tear.w * 0.62, 0.2, `burrata-${variant}-pool`, 9, 1.3);
  const strands = strokesPath(`burrata-${variant}-str`, 18, tear.len, 4, 10, 3, at.x, at.y);
  const strands2 = strokesPath(`burrata-${variant}-str2`, 12, tear.len, 3, 8, 2.5, at.x, at.y);
  const blobs = dotsPath(scatterDots(`burrata-${variant}-cream`, 6, tear.w * 0.8, 1.6, 3.2).map((dot) => ({ x: dot.x + at.x, y: dot.y + at.y, r: dot.r })));
  // intact variant: a gathered knot with soft twisted creases
  const knot = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const p0 = polar(a, 4);
    const p1 = polar(a + 0.6, 13 + (i % 3) * 3);
    const m = polar(a + 0.15, 10);
    return `M${p0.x - 4} ${p0.y - 4}Q${m.x - 4} ${m.y - 4} ${p1.x - 4} ${p1.y - 4}`;
  }).join('');
  return (
    <>
      <ellipse cx="4" cy="6" rx={R + 3} ry={R + 3} fill="#1a0a04" opacity="0.14" />
      <ellipse cx="3.2" cy="4.6" rx={R} ry={R} fill="#1a0a04" opacity="0.26" />
      {variant !== 2 && <path d={pool} transform={`translate(${r2(poolAt.x + 2.4)} ${r2(poolAt.y + 3.4)}) rotate(${deg})`} fill="#1a0a04" opacity="0.22" />}
      {variant !== 2 && <path d={pool} transform={`translate(${poolAt.x} ${poolAt.y}) rotate(${deg})`} fill="#fbf6ea" stroke="#e0d1b0" strokeWidth="1.2" />}
      <defs>
        <radialGradient id={g} cx="-14" cy="-17" r={r2(R * 1.45)} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.4" stopColor="#fcfaf4" />
          <stop offset="0.72" stopColor="#f1ebdf" />
          <stop offset="1" stopColor="#d6cab1" />
        </radialGradient>
        <radialGradient id={og} cx={r2(at.x + 3)} cy={r2(at.y + 3)} r={r2(tear.len * 1.2 + 1)} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.65" stopColor="#f7f0de" />
          <stop offset="1" stopColor="#e6d9ba" />
        </radialGradient>
        <clipPath id={oc}>
          <path d={tearPath} transform={tearT} />
        </clipPath>
      </defs>
      <path d={dome} fill={`url(#${g})`} />
      <path d={dome} fill="none" stroke="#b8a682" strokeOpacity="0.35" strokeWidth="2" />
      <path d={`M${r2(R * 0.82)} ${r2(R * 0.2)}A${R * 0.86} ${R * 0.86} 0 0 1 ${r2(R * 0.2)} ${r2(R * 0.82)}`} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      {variant === 2 ? (
        <>
          <path d={knot} fill="none" stroke="#d3c4a5" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
          <path d={knot} transform="translate(-1.3 -1.2)" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="-4" cy="-4" r="5.5" fill="#efe6d3" />
          <circle cx="-5.2" cy="-5.4" r="3.4" fill="#fff" />
        </>
      ) : (
        <>
          <path d={tearPath} transform={`${tearT} scale(1.12)`} fill="#d9caa8" fillOpacity="0.45" />
          <path d={tearPath} transform={tearT} fill={`url(#${og})`} />
          <g clipPath={`url(#${oc})`}>
            <path d={strands2} fill="none" stroke="#dccca8" strokeOpacity="0.85" strokeWidth="2.2" strokeLinecap="round" />
            <path d={strands} fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
            <path d={blobs} fill="#fffefa" />
          </g>
          <path d={tearPath} transform={tearT} fill="none" stroke="#c8b78f" strokeOpacity="0.55" strokeWidth="1.4" />
        </>
      )}
      <ellipse cx="-17" cy="-20" rx="17" ry="10" transform="rotate(-38 -17 -20)" fill="#fff" fillOpacity="0.55" />
      <ellipse cx="-19" cy="-22" rx="7" ry="3.6" transform="rotate(-38 -19 -22)" fill="#fff" fillOpacity="0.9" />
      <Sparkle x={-27} y={-14} r={2} o={0.9} />
      {variant !== 2 && <Sparkle x={r2(poolAt.x - 3)} y={r2(poolAt.y - 3)} r={1.6} o={0.8} />}
    </>
  );
}

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
  { slug: 'bufala', sizeCm: 3.8, density: 9, scatter: 'discrete', layer: 20, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Bufala },
  { slug: 'gorgonzola', sizeCm: 2.8, density: 14, scatter: 'discrete', layer: 20, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Gorgonzola },
  { slug: 'provola', sizeCm: 2.8, density: 12, scatter: 'discrete', layer: 20, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Provola },
  { slug: 'parmigiano', sizeCm: 4, density: 10, scatter: 'discrete', layer: 20, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Parmigiano },
  { slug: 'burrata', sizeCm: 8.5, density: 1, scatter: 'center', layer: 20, variants: 4, rotation: 'free', scaleJitter: 0.08, Piece: Burrata },
];
