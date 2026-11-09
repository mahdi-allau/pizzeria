import type { ReactElement } from 'react';
import { blobPath, dotsPath, polar, r2, scatterDots, waveOutline, type Dot, type Pt } from '../shapes';
import { Shadow, Sparkle, idFor } from '../parts';
import { createRng } from '../../rng';
import type { IngredientArt, PieceProps } from '../../types';
import { band, closed, openSmoothPath, quadsPath, sampleCurve, strokesPath, type Band } from './helpers-cheese-cured';

/**
 * Salumi (cured meats). REFERENCE PIECE: salame-piccante sets the style for the rest of this file.
 * Layering: contact shadow → body gradient → casing rim → fat flecks & pepper → oil sheen.
 * Ham-like slices (cotto, crudo, speck) are ribbons: a band around a wavy centreline, shaded light/dark along its
 * length so the folds read in 3D, with a fat rim along one edge. Crudo is added after baking: fresh, bright, no browning.
 */

function SalamePiccante({ variant, uid }: PieceProps) {
  const radius = [46, 44, 45][variant] ?? 46;
  const squash = [1, 0.93, 0.97][variant] ?? 1;
  const edge = blobPath(radius, 0.025, `sal-edge-${variant}`, 12, squash);
  const rim = blobPath(radius - 4.5, 0.02, `sal-rim-${variant}`, 12, squash);
  const fat = dotsPath(scatterDots(`sal-fat-${variant}`, 15, radius - 8, 2, 5.2));
  const pepper = dotsPath(scatterDots(`sal-pep-${variant}`, 10, radius - 7, 1, 2));
  const g = idFor(uid, 'sal', variant);
  return (
    <>
      <Shadow rx={radius * squash} ry={radius} />
      <defs>
        <radialGradient id={g} cx="-14" cy="-16" r={radius * 1.25} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e0634a" />
          <stop offset="0.55" stopColor="#c03b25" />
          <stop offset="1" stopColor="#8b2314" />
        </radialGradient>
      </defs>
      <path d={edge} fill={`url(#${g})`} />
      <path d={edge} fill="none" stroke="#6e170c" strokeOpacity="0.5" strokeWidth="2.6" />
      <path d={rim} fill="none" stroke="#f08a6c" strokeOpacity="0.28" strokeWidth="1.6" />
      {variant === 1 && <path d="M18 34 A44 44 0 0 0 40 8" fill="none" stroke="#5a1409" strokeOpacity="0.38" strokeWidth="7" strokeLinecap="round" />}
      <path d={fat} fill="#f6cdb8" fillOpacity="0.78" />
      <path d={pepper} fill="#4a0f06" fillOpacity="0.6" />
      <path d="M-30 -24 A38 38 0 0 1 8 -38" fill="none" stroke="#fff" strokeOpacity="0.34" strokeWidth="5" strokeLinecap="round" />
      <Sparkle x={-22} y={-30} />
    </>
  );
}

/** Soft contact shadow that follows any silhouette: two offset translucent copies, no blur filter. */
function ShapeShadow({ d, dx = 2.6, dy = 3.8, o = 0.3 }: { d: string; dx?: number; dy?: number; o?: number }): ReactElement {
  return (
    <g fill="#1a0a04">
      <path d={d} transform={`translate(${r2(dx * 1.25)} ${r2(dy * 1.25)})`} opacity={r2(o * 0.45)} stroke="#1a0a04" strokeWidth="3" strokeLinejoin="round" />
      <path d={d} transform={`translate(${r2(dx)} ${r2(dy)})`} opacity={o} />
    </g>
  );
}

// ── Ribbon: the shared look of sliced ham ────────────────────────────────────────
interface RibbonPalette {
  light: string;
  mid: string;
  dark: string;
  crease: string;
  fat: string;
  fatWidth: number;
  fatOpacity: number;
  edge: string;
  /** Baked items get a browned edge. */
  brown?: string;
  marbling?: string;
  specks?: string;
}

function Ribbon({ id, b, pal, waves, seed, shadow = true }: { id: string; b: Band; pal: RibbonPalette; waves: number; seed: string; shadow?: boolean }) {
  const d = closed(b.outline);
  const n = b.center.length;
  const a = b.center[0]!;
  const z = b.center[n - 1]!;
  const mid = Math.floor(n / 2);
  const steps = waves * 2;
  const creaseIdx = Array.from({ length: waves }, (_, k) => Math.round(((2 * k + 1) / steps) * (n - 1)));
  const creases = creaseIdx.map((i) => openSmoothPath([b.left[i]!, b.center[i]!, b.right[i]!])).join('');
  const crestIdx = Array.from({ length: waves + 1 }, (_, k) => Math.round(((2 * k) / steps) * (n - 1)));
  const gloss = crestIdx
    .filter((i) => i > 0 && i < n - 1)
    .map((i) => openSmoothPath(b.line(0.45, Math.max(0, i - 1), Math.min(n - 1, i + 1))))
    .join('');
  const sparkleAt = b.line(0.4, crestIdx[1] ?? mid, crestIdx[1] ?? mid)[0] ?? { x: 0, y: 0 };
  const marbling = pal.marbling ? [0.2, -0.45].map((f) => openSmoothPath(b.line(f, 1, n - 2))).join('') : '';
  const specks = pal.specks ? dotsPath(scatterDots(`${seed}-specks`, 14, 40, 0.5, 1.3)) : '';
  const gl = `${id}-l`;
  const gc = `${id}-x`;
  const c = `${id}-c`;
  return (
    <>
      {shadow && <ShapeShadow d={d} o={0.28} />}
      <defs>
        <linearGradient id={gl} x1={a.x} y1={a.y} x2={z.x} y2={z.y} gradientUnits="userSpaceOnUse">
          {Array.from({ length: steps + 1 }, (_, k) => (
            <stop key={k} offset={r2(k / steps)} stopColor={k % 2 ? pal.dark : pal.light} />
          ))}
        </linearGradient>
        <linearGradient id={gc} x1={b.left[mid]!.x} y1={b.left[mid]!.y} x2={b.right[mid]!.x} y2={b.right[mid]!.y} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a0a08" stopOpacity="0.18" />
        </linearGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={pal.mid} />
      <path d={d} fill={`url(#${gl})`} fillOpacity="0.85" />
      <path d={d} fill={`url(#${gc})`} />
      <g clipPath={`url(#${c})`}>
        {marbling && <path d={marbling} fill="none" stroke={pal.marbling} strokeOpacity="0.22" strokeWidth="1.6" strokeLinecap="round" />}
        {specks && <path d={specks} fill={pal.specks} fillOpacity="0.4" />}
        <path d={creases} fill="none" stroke={pal.crease} strokeOpacity="0.32" strokeWidth="4.5" strokeLinecap="round" />
        <path d={openSmoothPath(b.left)} fill="none" stroke={pal.fat} strokeOpacity={pal.fatOpacity} strokeWidth={pal.fatWidth} strokeLinecap="round" />
        {pal.brown && <path d={d} fill="none" stroke={pal.brown} strokeOpacity="0.4" strokeWidth="3.5" />}
      </g>
      <path d={d} fill="none" stroke={pal.edge} strokeOpacity="0.45" strokeWidth="1.1" strokeLinejoin="round" />
      <path d={gloss} fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="2.6" strokeLinecap="round" />
      <Sparkle x={sparkleAt.x} y={sparkleAt.y} r={1.8} o={0.6} />
    </>
  );
}

/** A wavy centreline running along x, with optional bend. */
const wavy = (n: number, len: number, amp: number, halfWaves: number, phase = 0, bend = 0, yOff = 0) =>
  sampleCurve(n, (t) => ({ x: -len / 2 + len * t, y: yOff + amp * Math.sin(Math.PI * halfWaves * t + phase) + bend * (4 * (t - 0.5) ** 2 - 0.33) }));

/** Half-width with soft ruffles and rounded, slightly narrower ends. */
const ruffled = (w: number, ruffle: number, freq: number, phase = 0) => (t: number) => w * (1 + ruffle * Math.sin(freq * t * Math.PI * 2 + phase)) * (0.72 + 0.28 * Math.sin(Math.PI * t) ** 0.5);

// ── Prosciutto cotto: folded pale-pink ham ───────────────────────────────────────
const COTTO: RibbonPalette = {
  light: '#fbd2ca',
  mid: '#f0aaa1',
  dark: '#d98d85',
  crease: '#a9554f',
  fat: '#fff6f0',
  fatWidth: 5,
  fatOpacity: 0.9,
  edge: '#b56d66',
  brown: '#c47d55',
};

function ProsciuttoCotto({ variant, uid }: PieceProps) {
  const id = (p: number) => idFor(uid, 'prosciutto-cotto', variant, p);
  const pal = { ...COTTO, light: ['#fbd2ca', '#fcd8cf', '#f9cbc4', '#fbd4cc'][variant] ?? COTTO.light };
  if (variant === 3) {
    const under = band(wavy(10, 70, 6, 2, 0.4, 0, 10), ruffled(14, 0.12, 2.5));
    const over = band(wavy(10, 60, 5, 2, 1.4, 6, -12), ruffled(13, 0.14, 2));
    return (
      <>
        <Ribbon id={id(0)} b={under} pal={pal} waves={2} seed={`prosciutto-cotto-3-0`} />
        <Ribbon id={id(1)} b={over} pal={pal} waves={2} seed={`prosciutto-cotto-3-1`} />
      </>
    );
  }
  const specs = [
    { c: wavy(14, 84, 9, 2.5, 0), w: ruffled(17, 0.12, 4.5), waves: 3 },
    { c: wavy(12, 70, 6, 2, 0.6, -6), w: ruffled(23, 0.1, 3), waves: 2 },
    {
      c: sampleCurve(14, (t) => {
        const p = polar(Math.PI * (1.1 + 0.8 * t), 40);
        return { x: p.x, y: p.y + 30 + 3 * Math.sin(Math.PI * 6 * t) };
      }),
      w: ruffled(14, 0.16, 5),
      waves: 3,
    },
  ][variant]!;
  return <Ribbon id={id(0)} b={band(specs.c, specs.w)} pal={pal} waves={specs.waves} seed={`prosciutto-cotto-${variant}`} />;
}

// ── Prosciutto crudo: thin deep-rose ribbons, translucent fat (after bake) ───────
const CRUDO: RibbonPalette = {
  light: '#ec7f86',
  mid: '#cf4f5d',
  dark: '#a3303f',
  crease: '#6f1424',
  fat: '#fff3ef',
  fatWidth: 10,
  fatOpacity: 0.78,
  edge: '#7e1f2c',
  marbling: '#f8c9c6',
};

function ProsciuttoCrudo({ variant, uid }: PieceProps) {
  const id = (p: number) => idFor(uid, 'prosciutto-crudo', variant, p);
  const pal = { ...CRUDO, mid: ['#cf4f5d', '#c8475a', '#d45966', '#c94b55'][variant] ?? CRUDO.mid };
  if (variant === 1) {
    // draped in a loose U
    const c = sampleCurve(16, (t) => {
      const p = polar(Math.PI * (0.05 + 0.9 * t), 34);
      return { x: p.x, y: -p.y + 18 + 3.5 * Math.sin(Math.PI * 8 * t) };
    });
    return <Ribbon id={id(0)} b={band(c, ruffled(12, 0.2, 5))} pal={pal} waves={4} seed="prosciutto-crudo-1" />;
  }
  if (variant === 3) {
    const a = band(wavy(12, 80, 7, 3, 0, 0, -10), ruffled(10, 0.22, 4));
    const b = band(wavy(12, 70, 6, 3, 1.2, 0, 14), ruffled(9, 0.2, 4.5, 1));
    return (
      <>
        <Ribbon id={id(0)} b={b} pal={pal} waves={3} seed="prosciutto-crudo-3-0" />
        <Ribbon id={id(1)} b={a} pal={pal} waves={3} seed="prosciutto-crudo-3-1" />
      </>
    );
  }
  const specs = [
    { c: wavy(16, 88, 12, 3.2, 0, 0), w: ruffled(14, 0.2, 5), waves: 3 },
    null,
    { c: wavy(14, 70, 4.5, 3, 0.5, 6), w: ruffled(15, 0.14, 4), waves: 3 },
  ][variant]!;
  return <Ribbon id={id(0)} b={band(specs.c, specs.w)} pal={pal} waves={specs.waves} seed={`prosciutto-crudo-${variant}`} />;
}

// ── Speck: smoky brick-red strips with a white fat rim ───────────────────────────
const SPECK: RibbonPalette = {
  light: '#b9573f',
  mid: '#933a28',
  dark: '#6e2618',
  crease: '#3e110a',
  fat: '#f1dcbc',
  fatWidth: 8,
  fatOpacity: 0.95,
  edge: '#3e130b',
  brown: '#4a1a0e',
  specks: '#3a0f08',
};

function Speck({ variant, uid }: PieceProps) {
  const id = idFor(uid, 'speck', variant);
  const pal = { ...SPECK, light: ['#b9573f', '#c0603f', '#b04f3a', '#bb5a44'][variant] ?? SPECK.light };
  const specs = [
    { c: wavy(10, 88, 3, 1, 0.3, 4), w: (t: number) => 11 * (0.85 + 0.15 * Math.sin(Math.PI * t)), waves: 1 },
    {
      c: sampleCurve(12, (t) => {
        const p = polar(Math.PI * (1.15 + 0.7 * t), 52);
        return { x: p.x, y: p.y + 36 };
      }),
      w: () => 11,
      waves: 1,
    },
    { c: wavy(8, 62, 3, 1, 0, 0), w: (t: number) => 17 * (0.9 + 0.1 * Math.sin(Math.PI * t)), waves: 1 },
    { c: wavy(12, 84, 11, 2, 0.2), w: () => 10, waves: 2 },
  ][variant]!;
  return <Ribbon id={id} b={band(specs.c, specs.w)} pal={pal} waves={specs.waves} seed={`speck-${variant}`} />;
}

// ── Salsiccia: crumbled browned sausage nuggets ──────────────────────────────────
const LUMPS: Array<Array<{ x: number; y: number; r: number; s: number }>> = [
  [{ x: 0, y: 0, r: 36, s: 1 }],
  [
    { x: -13, y: -8, r: 27, s: 1 },
    { x: 17, y: 14, r: 22, s: 0.9 },
  ],
  [{ x: 0, y: 0, r: 30, s: 1.4 }],
  [
    { x: -15, y: -11, r: 20, s: 1 },
    { x: 15, y: -9, r: 18, s: 1.1 },
    { x: 0, y: 17, r: 21, s: 1 },
  ],
];

function Salsiccia({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'salsiccia', variant, 'g');
  const lumps = LUMPS[variant] ?? LUMPS[0]!;
  const shift = (dots: Dot[], x: number, y: number) => dots.map((d) => ({ x: r2(d.x + x), y: r2(d.y + y), r: d.r }));
  const parts = lumps.map((l, i) => {
    const seed = `salsiccia-${variant}-${i}`;
    const d = blobPath(l.r, 0.2, `${seed}-edge`, 15, l.s);
    const inner = l.r * 0.7;
    return {
      l,
      d,
      bumps: dotsPath(shift(scatterDots(`${seed}-bump`, 7, inner, l.r * 0.14, l.r * 0.26), l.x - l.r * 0.08, l.y - l.r * 0.1)),
      crumbs: dotsPath(shift(scatterDots(`${seed}-crumb`, 12, l.r * 0.8, 1, 2.6), l.x, l.y)),
      seared: dotsPath(shift(scatterDots(`${seed}-sear`, 10, l.r * 0.9, 1.2, 3.2), l.x, l.y)),
      glints: dotsPath(shift(scatterDots(`${seed}-glint`, 4, inner, 0.6, 1.2), l.x, l.y)),
      seeds: strokesPath(`${seed}-fennel`, 3, inner, 2.6, 4, 0.6, l.x, l.y),
    };
  });
  return (
    <>
      {parts.map((p, i) => (
        <path key={`s${i}`} d={p.d} transform={`translate(${p.l.x + 2.6} ${p.l.y + 3.6})`} fill="#1a0a04" opacity="0.32" />
      ))}
      <defs>
        <radialGradient id={g} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor={['#bf7458', '#b86c55', '#c47a5e', '#b46850'][variant] ?? '#bf7458'} />
          <stop offset="0.55" stopColor="#8e4a33" />
          <stop offset="1" stopColor="#552817" />
        </radialGradient>
      </defs>
      {parts.map((p, i) => (
        <g key={i}>
          <path d={p.d} transform={`translate(${p.l.x} ${p.l.y})`} fill={`url(#${g})`} />
          <path d={p.d} transform={`translate(${p.l.x} ${p.l.y})`} fill="none" stroke="#3e180e" strokeOpacity="0.5" strokeWidth="1.6" />
          <path d={p.bumps} fill="#d08a6c" fillOpacity="0.32" />
          <path d={p.crumbs} fill="#e7a88c" fillOpacity="0.45" />
          <path d={p.seared} fill="#3a160b" fillOpacity="0.55" />
          <path d={p.seeds} fill="none" stroke="#a9a066" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" />
          <path d={p.glints} fill="#fff" fillOpacity="0.7" />
          <Sparkle x={r2(p.l.x - p.l.r * 0.35)} y={r2(p.l.y - p.l.r * 0.4)} r={r2(Math.max(1.4, p.l.r * 0.07))} o={0.55} />
        </g>
      ))}
    </>
  );
}

// ── Würstel: frankfurter slices ──────────────────────────────────────────────────
function wurstelOutline(variant: number): { d: string; rx: number; ry: number } {
  if (variant === 1) return { d: blobPath(33, 0.025, 'wurstel-1-edge', 12, 1.38), rx: 45, ry: 33 };
  if (variant === 2) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = polar(Math.PI + (i / 8) * Math.PI, 42);
      pts.push({ x: p.x, y: r2(p.y + 16) });
    }
    pts.push({ x: 20, y: 18 }, { x: -20, y: 18 });
    return { d: closed(pts), rx: 40, ry: 26 };
  }
  const r = variant === 3 ? 38 : 43;
  return { d: blobPath(r, 0.02, `wurstel-${variant}-edge`, 12), rx: r, ry: r };
}

function Wurstel({ variant, uid }: PieceProps) {
  const { d, rx, ry } = wurstelOutline(variant);
  const g = idFor(uid, 'wurstel', variant, 'g');
  const c = idFor(uid, 'wurstel', variant, 'c');
  const rng = createRng(`wurstel-${variant}-hatch`);
  const ang = rng.range(-0.6, 0.6);
  let hatch = '';
  for (let k = -4; k <= 4; k++) {
    for (const a of [ang + Math.PI / 4, ang - Math.PI / 4]) {
      const o = k * 12;
      const nx = Math.cos(a + Math.PI / 2) * o;
      const ny = Math.sin(a + Math.PI / 2) * o;
      const p0 = { x: r2(nx - Math.cos(a) * 50), y: r2(ny - Math.sin(a) * 50) };
      const p1 = { x: r2(nx + Math.cos(a) * 50), y: r2(ny + Math.sin(a) * 50) };
      hatch += `M${p0.x} ${p0.y}L${p1.x} ${p1.y}`;
    }
  }
  const blisters = dotsPath(scatterDots(`wurstel-${variant}-blis`, variant === 3 ? 9 : 5, Math.min(rx, ry) - 6, 1.5, 3.6));
  const pores = dotsPath(scatterDots(`wurstel-${variant}-pores`, 12, Math.min(rx, ry) - 8, 0.4, 0.9));
  return (
    <>
      <ShapeShadow d={d} o={0.3} />
      <defs>
        <radialGradient id={g} cx="-12" cy="-14" r={r2(Math.max(rx, ry) * 1.35)} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={['#fbcfb3', '#fad3b8', '#f8c7a9', '#f6c2a2'][variant] ?? '#fbcfb3'} />
          <stop offset="0.55" stopColor="#efa684" />
          <stop offset="1" stopColor="#d98563" />
        </radialGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <path d={hatch} fill="none" stroke="#c97454" strokeOpacity="0.08" strokeWidth="0.9" />
        <path d={pores} fill="#d98a68" fillOpacity="0.5" />
        <path d={blisters} fill="#b8603c" fillOpacity={variant === 3 ? 0.35 : 0.22} />
        <path d={d} fill="none" stroke="#b5532f" strokeOpacity="0.65" strokeWidth="8" />
        <path d={d} transform="scale(0.84)" fill="none" stroke="#ffd8c0" strokeOpacity="0.45" strokeWidth="1.6" />
      </g>
      <path d={d} fill="none" stroke="#7d3018" strokeOpacity="0.55" strokeWidth="1.3" />
      <path d={`M${r2(-rx * 0.66)} ${r2(-ry * 0.3)}Q${r2(-rx * 0.55)} ${r2(-ry * 0.65)} ${r2(-rx * 0.12)} ${r2(-ry * 0.74)}`} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="3.5" strokeLinecap="round" />
      <Sparkle x={r2(-rx * 0.42)} y={r2(-ry * 0.5)} r={2} o={0.7} />
    </>
  );
}

// ── Mortadella: big pale-pink slices with fat cubes and pistachio ────────────────
function mortadellaOutline(variant: number): { d: string; fold?: string; r: number } {
  if (variant === 1) {
    // folded in half: the fold is the straight edge at the bottom
    const rng = createRng('mortadella-1-edge');
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = polar(Math.PI + (i / 12) * Math.PI, 46 + rng.range(-1.6, 1.6));
      pts.push({ x: p.x, y: r2(p.y + 20) });
    }
    pts.push({ x: 24, y: 22 }, { x: 0, y: 23 }, { x: -24, y: 22 });
    return { d: closed(pts), fold: 'M-42 20Q0 24 42 20', r: 46 };
  }
  if (variant === 2) {
    // folded into a quarter
    const rng = createRng('mortadella-2-edge');
    const pts: Pt[] = [{ x: -30, y: -30 }];
    for (let i = 0; i <= 8; i++) {
      const p = polar((i / 8) * (Math.PI / 2), 64 + rng.range(-1.8, 1.8));
      pts.push({ x: r2(p.x - 30), y: r2(p.y - 30) });
    }
    return { d: closed(pts, 0.35), fold: 'M-28 -24L-28 32M-24 -28L32 -28', r: 40 };
  }
  const r = variant === 3 ? 45 : 46;
  return { d: closed(waveOutline(r, variant === 3 ? 3.4 : 1.8, `mortadella-${variant}-edge`, 36)), r };
}

function Mortadella({ variant, uid }: PieceProps) {
  const { d, fold, r } = mortadellaOutline(variant);
  const g = idFor(uid, 'mortadella', variant, 'g');
  const c = idFor(uid, 'mortadella', variant, 'c');
  const cx = variant === 2 ? -4 : 0;
  const cy = variant === 1 ? 4 : variant === 2 ? -4 : 0;
  const fat = quadsPath(`mortadella-${variant}-fat`, variant === 2 ? 7 : 10, r - 8, 3, 6.5);
  const pist = dotsPath(scatterDots(`mortadella-${variant}-pist`, variant === 2 ? 4 : 6, r - 10, 1.4, 2.6));
  const ruffles = Array.from({ length: 14 }, (_, k) => {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    const p0 = polar(a, r - 9);
    const p1 = polar(a + 0.05, r + 2);
    return `M${p0.x} ${p0.y}L${p1.x} ${p1.y}`;
  }).join('');
  return (
    <>
      <ShapeShadow d={d} o={0.27} />
      <defs>
        <radialGradient id={g} cx="-14" cy="-16" r={r * 1.5} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={['#fcd9d4', '#fbd5d0', '#fdddd8', '#fad2cd'][variant] ?? '#fcd9d4'} />
          <stop offset="0.6" stopColor="#f2b5b0" />
          <stop offset="1" stopColor="#de9893" />
        </radialGradient>
        <clipPath id={c}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}>
        <g transform={`translate(${cx} ${cy})`}>
          <path d={ruffles} fill="none" stroke="#c98682" strokeOpacity="0.28" strokeWidth="2.6" strokeLinecap="round" />
          <path d={fat} fill="#fff8f3" fillOpacity="0.92" />
          <path d={pist} fill="#7da449" />
          <path d={pist} transform="translate(-0.5 -0.5) scale(0.98)" fill="#a8c96a" fillOpacity="0.6" />
        </g>
        {fold && <path d={fold} fill="none" stroke="#c07c78" strokeOpacity="0.45" strokeWidth="7" strokeLinecap="round" />}
        {fold && <path d={fold} transform="translate(-1.5 -2.5)" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />}
        <path d={d} fill="none" stroke="#d48c88" strokeOpacity="0.5" strokeWidth="4" />
      </g>
      <path d={d} fill="none" stroke="#b5726e" strokeOpacity="0.5" strokeWidth="1.1" strokeLinejoin="round" />
      <ellipse cx="-14" cy="-16" rx="20" ry="11" transform="rotate(-32 -14 -16)" fill="#fff" fillOpacity="0.2" />
      <Sparkle x={-20} y={-22} r={1.8} o={0.45} />
    </>
  );
}

export const curedArt: IngredientArt[] = [
  {
    slug: 'salame-piccante',
    sizeCm: 5.6,
    density: 11,
    scatter: 'discrete',
    layer: 40,
    variants: 3,
    rotation: 'free',
    scaleJitter: 0.1,
    Piece: SalamePiccante,
  },
  { slug: 'prosciutto-cotto', sizeCm: 6, density: 7, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: ProsciuttoCotto },
  { slug: 'prosciutto-crudo', sizeCm: 7, density: 6, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: ProsciuttoCrudo },
  { slug: 'speck', sizeCm: 6, density: 7, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Speck },
  { slug: 'salsiccia', sizeCm: 2.3, density: 18, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Salsiccia },
  { slug: 'wurstel', sizeCm: 3, density: 12, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.1, Piece: Wurstel },
  { slug: 'mortadella', sizeCm: 5.5, density: 7, scatter: 'discrete', layer: 40, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Mortadella },
];
