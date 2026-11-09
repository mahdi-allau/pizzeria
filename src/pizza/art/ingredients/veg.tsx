import { blobPath, dotsPath, r2, scatterDots } from '../shapes';
import { Shadow, Sparkle, idFor } from '../parts';
import { arcBand, arcD, bandDots, off, onCircle, rocketLeaf } from './helpers-veg';
import type { IngredientArt, PieceProps } from '../../types';

/**
 * Verdure (vegetables, herbs). REFERENCE PIECES: funghi, basilico and olive-nere set the style for the rest of this
 * file. Baked vegetables are slightly browned at the edges; `afterBake` ones (basilico, rucola) look fresh and bright.
 */

// ── Funghi: a mushroom slice in silhouette (cap + stem) ──────────────────────────
const MUSHROOM = 'M-44 -4C-44 -34 -22 -46 0 -46C22 -46 44 -34 44 -4C44 2 38 6 30 6L14 6C14 14 15 28 17 40C17 44 14 46 10 46L-10 46C-14 46 -17 44 -17 40C-15 28 -14 14 -14 6L-30 6C-38 6 -44 2 -44 -4Z';

function Funghi({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'fun', variant);
  const transform = ['', 'scale(1.1 0.94) skewX(-5)', 'scale(0.88 1.08) skewX(4)'][variant] ?? '';
  return (
    <g transform={transform}>
      <g transform="translate(2.4 3.4)" fill="#1a0a04" fillOpacity="0.3">
        <path d={MUSHROOM} />
      </g>
      <defs>
        <linearGradient id={g} x1="-40" y1="-40" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f8efdc" />
          <stop offset="0.6" stopColor="#ecdcba" />
          <stop offset="1" stopColor="#d9c39a" />
        </linearGradient>
      </defs>
      <path d={MUSHROOM} fill={`url(#${g})`} />
      <path d={MUSHROOM} fill="none" stroke="#a8825a" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-44 -4C-44 -34 -22 -46 0 -46C22 -46 44 -34 44 -4" fill="none" stroke="#a37a52" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M-33 -3C-30 -26 -14 -36 0 -36C14 -36 30 -26 33 -3" fill="none" stroke="#d6c096" strokeWidth="2" strokeLinecap="round" />
      <path d="M-12 8C-11 20 -10 32 -8 40" fill="none" stroke="#d3bc90" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M-30 -30C-22 -38 -12 -41 -2 -42" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

// ── Basilico: a fresh leaf ───────────────────────────────────────────────────────
const LEAF = 'M0 47C-27 36 -36 8 -22 -22C-14 -38 -5 -46 0 -49C5 -46 14 -38 22 -22C36 8 27 36 0 47Z';

function Leaf({ uid, variant, scale = 1, rotate = 0, x = 0, y = 0 }: { uid: string; variant: number; scale?: number; rotate?: number; x?: number; y?: number }) {
  const g = idFor(uid, 'bas', variant, Math.round(rotate));
  const veins = [1, 2, 3, 4, 5].map((i) => {
    const yy = 38 - i * 15;
    return `M0 ${yy}C-8 ${yy - 3} -16 ${yy - 10} -22 ${yy - 18}M0 ${yy}C8 ${yy - 3} 16 ${yy - 10} 22 ${yy - 18}`;
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <g transform="translate(2.2 3.2)" fill="#0d1a08" fillOpacity="0.3">
        <path d={LEAF} />
      </g>
      <defs>
        <linearGradient id={g} x1="-30" y1="0" x2="30" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f7f31" />
          <stop offset="0.5" stopColor="#58b24b" />
          <stop offset="0.8" stopColor="#7ccc5e" />
          <stop offset="1" stopColor="#3f9040" />
        </linearGradient>
      </defs>
      <path d={LEAF} fill={`url(#${g})`} />
      <path d={LEAF} fill="none" stroke="#1e5a24" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" />
      <path d={veins.join('')} fill="none" stroke="#c4e8a0" strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M0 45L0 -42" fill="none" stroke="#d3f0ac" strokeOpacity="0.85" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-10 -30C-18 -14 -20 4 -14 22" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

function Basilico({ variant, uid }: PieceProps) {
  if (variant === 1) return <g transform="skewX(-7)"><Leaf uid={uid} variant={1} scale={0.92} /></g>;
  if (variant === 2) {
    return (
      <>
        <Leaf uid={uid} variant={2} scale={0.78} rotate={-24} x={-9} y={3} />
        <Leaf uid={uid} variant={2} scale={0.7} rotate={26} x={11} y={-2} />
      </>
    );
  }
  return <Leaf uid={uid} variant={0} />;
}

// ── Olive nere: a ring with a real hole ──────────────────────────────────────────
function OliveNere({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'oli', variant);
  const rx = [46, 47, 46][variant] ?? 46;
  const ry = [44, 40, 44][variant] ?? 44;
  const ring = `M${-rx} 0a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0ZM-18 0a18 17 0 1 0 36 0a18 17 0 1 0 -36 0Z`;
  const half = `M${-rx} 0a${rx} ${ry} 0 0 1 ${rx * 2} 0L18 0a18 17 0 0 0 -36 0Z`;
  const d = variant === 2 ? half : ring;
  return (
    <g transform={variant === 1 ? 'rotate(18)' : ''}>
      <g transform="translate(2.6 3.8)" fill="#120905" fillOpacity="0.36">
        <path d={d} fillRule="evenodd" />
      </g>
      <defs>
        <radialGradient id={g} cx="-14" cy="-16" r="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#554a4e" />
          <stop offset="0.6" stopColor="#2b2427" />
          <stop offset="1" stopColor="#120d11" />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${g})`} fillRule="evenodd" />
      {variant !== 2 && <path d="M-18 0a18 17 0 1 0 36 0a18 17 0 1 0 -36 0Z" fill="none" stroke="#07040a" strokeOpacity="0.65" strokeWidth="3" />}
      {variant !== 2 && <path d="M13 11A18 17 0 0 1 -11 14" fill="none" stroke="#9a8d92" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />}
      <path d="M-34 -24A42 40 0 0 1 -6 -42" fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="4" strokeLinecap="round" />
      <Sparkle x={-28} y={-31} r={1.8} o={0.5} />
    </g>
  );
}

// ── Peperoni: a roasted bell-pepper strip, one colour family per variant ─────────
const PEPPER = [
  { hi: '#ff7556', mid: '#e0301b', lo: '#9c150a', char: '#2e0a04', flesh: '#ffb8a2' },
  { hi: '#ffe87a', mid: '#f4b416', lo: '#b97a04', char: '#3d2304', flesh: '#fff3bf' },
  { hi: '#9fdc68', mid: '#3c972b', lo: '#1c5714', char: '#14220a', flesh: '#d2efaa' },
  { hi: '#ff6a4c', mid: '#c9261a', lo: '#82110a', char: '#2a0804', flesh: '#ffae96' },
];
const PEPPER_GEO = [
  { R: 62, hw: 11.5, span: 86 },
  { R: 48, hw: 10.5, span: 106 },
  { R: 86, hw: 12, span: 60 },
  { R: 42, hw: 13, span: 112 },
];

function Peperoni({ variant, uid }: PieceProps) {
  const c = PEPPER[variant] ?? PEPPER[0]!;
  const { R, hw, span } = PEPPER_GEO[variant] ?? PEPPER_GEO[0]!;
  const half = span / 2;
  const cy = r2((R * (1 + Math.cos((half * Math.PI) / 180))) / 2);
  const a0 = -90 - half;
  const a1 = -90 + half;
  const o = { cx: 0, cy, R, hw, a0, a1 };
  const d = arcBand({ ...o, seed: `peperoni-${variant}-edge`, wobble: 0.16, taper: 0.22, steps: 12 });
  const blisters = dotsPath(bandDots(`peperoni-${variant}-char`, 7, o, 2.4, 5, 0.85));
  const specks = dotsPath(bandDots(`peperoni-${variant}-speck`, 8, o, 0.7, 1.4, 0.9));
  const tips = dotsPath([...bandDots(`peperoni-${variant}-tipA`, 3, { ...o, a1: a0 + 5 }, 2.2, 4, 0.3), ...bandDots(`peperoni-${variant}-tipB`, 3, { ...o, a0: a1 - 5 }, 2.2, 4, 0.3)]);
  const g = idFor(uid, 'pep', variant);
  const outer = R + hw;
  return (
    <>
      <g transform="translate(2.6 3.8)" fill="#1a0a04">
        <path d={d} fillOpacity="0.16" transform="translate(0.8 0.8)" />
        <path d={d} fillOpacity="0.26" />
      </g>
      <defs>
        <radialGradient id={g} cx="0" cy={cy} r={outer} gradientUnits="userSpaceOnUse">
          <stop offset={off(R - hw, outer)} stopColor={c.lo} />
          <stop offset={off(R - hw * 0.6, outer)} stopColor={c.mid} />
          <stop offset={off(R + hw * 0.25, outer)} stopColor={c.hi} />
          <stop offset={off(R + hw * 0.85, outer)} stopColor={c.mid} />
          <stop offset="1" stopColor={c.lo} />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${g})`} />
      <path d={arcD(0, cy, R - hw * 0.15, a0 + 8, a1 - 8)} fill="none" stroke={c.lo} strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" />
      <path d={blisters} fill={c.char} fillOpacity="0.2" />
      <path d={tips} fill={c.char} fillOpacity="0.3" />
      <path d={specks} fill={c.char} fillOpacity="0.45" />
      <path d={d} fill="none" stroke={c.char} strokeOpacity="0.45" strokeWidth="1.8" strokeLinejoin="round" />
      <path d={arcD(0, cy, R - hw + 1.8, a0 + 6, a1 - 6)} fill="none" stroke={c.flesh} strokeOpacity="0.45" strokeWidth="1.3" strokeLinecap="round" />
      <path d={arcD(0, cy, R + hw * 0.3, a0 + span * 0.1, a0 + span * 0.46)} fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="5.5" strokeLinecap="round" />
      <path d={arcD(0, cy, R + hw * 0.3, a0 + span * 0.14, a0 + span * 0.4)} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
      <Sparkle {...onCircle(0, cy, R + hw * 0.3, a0 + span * 0.2)} r={1.7} o={0.7} />
    </>
  );
}

// ── Cipolla rossa: translucent half-rings, violet skin fading to white ───────────
const ONION = [
  { cy: 12, a0: -195, a1: 15, layers: [{ R: 38, hw: 4.6 }, { R: 29, hw: 4 }] },
  { cy: 10, a0: -186, a1: 6, layers: [{ R: 36, hw: 5 }] },
  { cy: 30, a0: -152, a1: -28, layers: [{ R: 46, hw: 4.4 }, { R: 37.2, hw: 4.2 }, { R: 28.8, hw: 4 }] },
  { cy: 0, a0: -60, a1: 220, layers: [{ R: 32, hw: 4.8 }] },
];

function Cipolla({ variant, uid }: PieceProps) {
  const s = ONION[variant] ?? ONION[0]!;
  const bands = s.layers.map((l, i) => {
    const shrink = i * 6;
    const a0 = s.a0 + shrink;
    const a1 = s.a1 - shrink;
    return { ...l, a0, a1, d: arcBand({ cx: 0, cy: s.cy, R: l.R, hw: l.hw, a0, a1, seed: `cipolla-${variant}-${i}`, wobble: 0.06, taper: 0.15 }) };
  });
  const caramel = dotsPath(
    bands.flatMap((b, i) => [
      ...bandDots(`cipolla-${variant}-car-${i}`, 2, { cx: 0, cy: s.cy, R: b.R, hw: b.hw, a0: b.a0, a1: b.a0 + 10 }, 1.2, 2.4, 0.3),
      ...bandDots(`cipolla-${variant}-cdr-${i}`, 2, { cx: 0, cy: s.cy, R: b.R, hw: b.hw, a0: b.a1 - 10, a1: b.a1 }, 1.2, 2.4, 0.3),
    ]),
  );
  const first = bands[0]!;
  return (
    <>
      <g transform="translate(2.4 3.4)" fill="#1a0a04" fillOpacity="0.22">
        {bands.map((b, i) => (
          <path key={i} d={b.d} />
        ))}
      </g>
      <defs>
        {bands.map((b, i) => {
          const outer = b.R + b.hw;
          return (
            <radialGradient key={i} id={idFor(uid, 'cip', variant, i)} cx="0" cy={s.cy} r={outer} gradientUnits="userSpaceOnUse">
              <stop offset={off(b.R - b.hw, outer)} stopColor="#f2e4ea" />
              <stop offset={off(b.R - b.hw * 0.2, outer)} stopColor="#efd6e2" />
              <stop offset={off(b.R + b.hw * 0.45, outer)} stopColor="#c56fa3" />
              <stop offset={off(b.R + b.hw * 0.8, outer)} stopColor="#8e2a6e" />
              <stop offset="1" stopColor="#5e1748" />
            </radialGradient>
          );
        })}
      </defs>
      {bands.map((b, i) => (
        <g key={i}>
          <path d={b.d} fill={`url(#${idFor(uid, 'cip', variant, i)})`} fillOpacity="0.84" />
          <path d={b.d} fill="none" stroke="#6a2a2e" strokeOpacity="0.32" strokeWidth="1.3" strokeLinejoin="round" />
          <path d={arcD(0, s.cy, b.R - b.hw * 0.35, b.a0 + 4, b.a1 - 4)} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
          <path d={arcD(0, s.cy, b.R + b.hw * 0.2, b.a0 + (b.a1 - b.a0) * 0.1, b.a0 + (b.a1 - b.a0) * 0.42)} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
      <path d={caramel} fill="#8a4a22" fillOpacity="0.22" />
      <Sparkle {...onCircle(0, s.cy, first.R + first.hw * 0.2, first.a0 + (first.a1 - first.a0) * 0.2)} r={1.5} o={0.75} />
    </>
  );
}

// ── Melanzane grigliate: slices and a cube, purple skin rim, grill marks ─────────
function Melanzane({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'mel', variant);
  const clip = idFor(uid, 'mel', variant, 'clip');
  let skin: string;
  let flesh: string;
  let seedDots: string;
  let sponge: string;
  let lift = 'M-30 -22A40 38 0 0 1 4 -38';
  if (variant === 2) {
    // half slice, flat cut side down
    skin = 'M-45 14C-45 -16 -24 -32 0 -32C24 -32 45 -16 45 14Z';
    flesh = 'M-40.5 14C-40.5 -11 -22 -27 0 -27C22 -27 40.5 -11 40.5 14Z';
    seedDots = dotsPath(scatterDots('melanzane-2-seed', 20, 22, 0.9, 1.6, 10).filter((dt) => dt.y < 10).map((dt) => ({ ...dt, y: r2(dt.y + 10) })));
    sponge = dotsPath(scatterDots('melanzane-2-sponge', 18, 34, 0.8, 2, 0).filter((dt) => dt.y < 4 && dt.y > -30).map((dt) => ({ ...dt, y: r2(dt.y + 10) })));
    lift = 'M-30 -14C-24 -24 -12 -28 2 -29';
  } else if (variant === 3) {
    // a grilled cube, skin on one face
    skin = 'M-30 -32C-12 -35 14 -35 30 -31C33 -14 33 12 30 29C12 32 -12 32 -30 29C-33 12 -33 -14 -30 -32Z';
    flesh = 'M-29 -22C-12 -24 12 -24 29 -22C31 -6 31 12 29 28C12 31 -12 31 -29 28C-31 12 -31 -6 -29 -22Z';
    seedDots = dotsPath(scatterDots('melanzane-3-seed', 12, 20, 0.9, 1.5, 4).map((dt) => ({ ...dt, y: r2(dt.y + 4) })));
    sponge = dotsPath(scatterDots('melanzane-3-sponge', 14, 24, 0.8, 1.8).map((dt) => ({ ...dt, y: r2(dt.y + 4) })));
    lift = 'M-26 -30C-10 -33 10 -33 22 -31';
  } else {
    const squash = variant === 1 ? 0.8 : 1;
    skin = blobPath(45, 0.03, `melanzane-${variant}-skin`, 14, squash);
    flesh = blobPath(39.5, 0.035, `melanzane-${variant}-flesh`, 14, squash);
    seedDots = dotsPath(scatterDots(`melanzane-${variant}-seed`, 26, 24, 0.9, 1.6, 12).map((dt) => ({ ...dt, x: r2(dt.x * squash) })));
    sponge = dotsPath(scatterDots(`melanzane-${variant}-sponge`, 22, 34, 0.8, 2.1).map((dt) => ({ ...dt, x: r2(dt.x * squash) })));
  }
  const marks = variant === 3 ? [-8, 12] : variant === 2 ? [-14, 4] : [-22, -2, 18];
  const grill = marks.map((k) => `M-60 ${k}L60 ${k}`).join('');
  return (
    <>
      <g transform="translate(2.6 3.8)" fill="#1a0a04">
        <path d={skin} fillOpacity="0.14" transform="translate(1 1)" />
        <path d={skin} fillOpacity="0.28" />
      </g>
      <defs>
        <radialGradient id={`${g}-s`} cx="-16" cy="-18" r="72" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6c3a70" />
          <stop offset="0.5" stopColor="#3a1a42" />
          <stop offset="1" stopColor="#170a1c" />
        </radialGradient>
        <radialGradient id={`${g}-f`} cx="-8" cy="-8" r="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6e2ac" />
          <stop offset="0.5" stopColor="#e6c888" />
          <stop offset="0.82" stopColor="#c9a560" />
          <stop offset="1" stopColor="#8c6a2e" />
        </radialGradient>
        <clipPath id={clip}>
          <path d={flesh} />
        </clipPath>
      </defs>
      <path d={skin} fill={`url(#${g}-s)`} />
      <path d={flesh} fill={`url(#${g}-f)`} />
      <path d={sponge} fill="#fff8dc" fillOpacity="0.35" />
      <path d={seedDots} fill="#7a5a2a" fillOpacity="0.55" />
      <g clipPath={`url(#${clip})`}>
        <g transform="rotate(-32)">
          <path d={grill} fill="none" stroke="#6a4416" strokeOpacity="0.25" strokeWidth="10" />
          <path d={grill} fill="none" stroke="#2a1606" strokeOpacity="0.5" strokeWidth="4" strokeDasharray="34 3 18 2" />
        </g>
      </g>
      <path d={flesh} fill="none" stroke="#6e5a28" strokeOpacity="0.45" strokeWidth="1.6" />
      <path d={skin} fill="none" stroke="#0d0510" strokeOpacity="0.5" strokeWidth="1.4" />
      <path d={lift} fill="none" stroke="#e8c8f0" strokeOpacity="0.4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-22 -8C-18 -16 -10 -21 -1 -22" fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="4" strokeLinecap="round" />
      <Sparkle x={-14} y={-14} r={1.8} o={0.6} />
    </>
  );
}

// ── Zucchine: rounds and half-moons, green skin, pale flesh, seed ring ────────────
function Zucchine({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'zuc', variant);
  const half = variant === 2;
  const squash = variant === 1 ? 0.86 : 1;
  const skin = half ? 'M-45 12C-45 -18 -24 -34 0 -34C24 -34 45 -18 45 12Z' : blobPath(45, 0.025, `zucchine-${variant}-skin`, 14, squash);
  const flesh = half ? 'M-41 12C-41 -14 -22 -30 0 -30C22 -30 41 -14 41 12Z' : blobPath(41, 0.03, `zucchine-${variant}-flesh`, 14, squash);
  const ringR = half ? 0 : 1;
  const seeds = Array.from({ length: half ? 7 : 12 }, (_, i) => {
    const a = half ? -170 + (i * 160) / 6 : i * 30 + 8;
    const p = onCircle(0, half ? 12 : 0, 15 + (i % 2) * 2.5, a);
    return { x: r2(p.x * squash), y: p.y, r: 1.6 };
  });
  const brown = dotsPath(scatterDots(`zucchine-${variant}-brown`, variant === 3 ? 7 : 4, 36, 2.5, 5.5, 22).filter((dt) => !half || dt.y < 4));
  const pores = dotsPath(scatterDots(`zucchine-${variant}-pore`, 16, 34, 0.6, 1.2, 20).filter((dt) => !half || dt.y < 8));
  return (
    <>
      <g transform="translate(2.6 3.8)" fill="#0f1a06">
        <path d={skin} fillOpacity="0.14" transform="translate(1 1)" />
        <path d={skin} fillOpacity="0.28" />
      </g>
      <defs>
        <radialGradient id={`${g}-s`} cx="-14" cy="-16" r="68" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f8a2f" />
          <stop offset="0.6" stopColor="#24521a" />
          <stop offset="1" stopColor="#11300c" />
        </radialGradient>
        <radialGradient id={`${g}-f`} cx="-6" cy={half ? 4 : -6} r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6f6d6" />
          <stop offset="0.55" stopColor="#e5ecb6" />
          <stop offset="0.85" stopColor="#c6db8c" />
          <stop offset="1" stopColor="#9fc06a" />
        </radialGradient>
      </defs>
      <path d={skin} fill={`url(#${g}-s)`} />
      <path d={flesh} fill={`url(#${g}-f)`} />
      <path d={flesh} fill="none" stroke="#9cc760" strokeOpacity="0.7" strokeWidth="2" />
      {ringR > 0 && <ellipse cx="0" cy="0" rx={r2(19 * squash)} ry="19" fill="#d6e2a4" fillOpacity="0.45" />}
      {half && <path d="M-20 12A20 20 0 0 1 20 12Z" fill="#d6e2a4" fillOpacity="0.45" />}
      <path d={pores} fill="#b8cc84" fillOpacity="0.5" />
      <path d={dotsPath(seeds)} fill="#fbfbe6" fillOpacity="0.85" stroke="#a7b874" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d={brown} fill="#b07a30" fillOpacity={variant === 3 ? 0.22 : 0.12} />
      <path d={skin} fill="none" stroke="#0a1f06" strokeOpacity="0.45" strokeWidth="1.4" />
      <path d={half ? 'M-32 -12C-26 -22 -14 -27 -2 -28' : 'M-30 -22A38 38 0 0 1 2 -38'} fill="none" stroke="#c9f09a" strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" />
      <path d={half ? 'M-24 -2C-20 -10 -12 -15 -4 -16' : 'M-22 -8C-18 -16 -10 -21 -1 -22'} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="3.4" strokeLinecap="round" />
      <Sparkle x={-15} y={half ? -6 : -15} r={1.9} o={0.7} />
    </>
  );
}

// ── Carciofi: artichoke hearts cut lengthwise, nested leaf layers around a cream heart ─
/** A broad leaf-layer silhouette: narrow at the base (0, by), widest high up, softly flattened top. */
function artLayer(by: number, len: number, w: number, lean = 0): string {
  const y = (k: number) => r2(by - len * k);
  const x = (k: number, at: number) => r2(w * k + lean * at);
  return `M${x(0, 1)} ${y(1)}C${x(0.45, 0.8)} ${y(0.8)} ${x(1, 0.45)} ${y(0.5)} ${x(0.92, 0.15)} ${y(0.16)}C${x(0.82, 0)} ${y(-0.06)} ${x(-0.82, 0)} ${y(-0.06)} ${x(-0.92, 0.15)} ${y(0.16)}C${x(-1, 0.45)} ${y(0.5)} ${x(-0.45, 0.8)} ${y(0.8)} ${x(0, 1)} ${y(1)}Z`;
}

const ARTICHOKE = [
  { L: 86, W: 40, lean: 0, t: '' },
  { L: 74, W: 46, lean: 3, t: '' },
  { L: 88, W: 34, lean: -2, t: 'skewX(-8)' },
  { L: 72, W: 42, lean: 0, t: 'rotate(8)' },
];
const ART_LAYERS = ['#4f6026', '#7a8a3a', '#aeb05c', '#e2d696', '#f5ebc0'];

function Carciofi({ variant, uid }: PieceProps) {
  const s = ARTICHOKE[variant] ?? ARTICHOKE[0]!;
  const g = idFor(uid, 'car', variant);
  const by = r2(s.L / 2);
  const layers = ART_LAYERS.map((color, k) => ({ color, d: artLayer(by, s.L * (1 - k * 0.15), s.W * (1 - k * 0.18), s.lean * (1 - k * 0.2)) }));
  const outer = layers[0]!.d;
  const heartY = r2(by - s.L * 0.12);
  const fuzz = Array.from({ length: 11 }, (_, i) => {
    const a = -160 + i * 14;
    const p0 = onCircle(0, heartY, s.L * 0.24, a);
    const p1 = onCircle(0, heartY, s.L * 0.31, a);
    return `M${p0.x} ${p0.y}L${p1.x} ${p1.y}`;
  }).join('');
  const tips = dotsPath([
    { x: r2(s.lean), y: r2(by - s.L + 3), r: 3.2 },
    { x: r2(s.lean - 4), y: r2(by - s.L * 0.9), r: 2.4 },
    { x: r2(s.lean + 5), y: r2(by - s.L * 0.88), r: 2.2 },
  ]);
  return (
    <g transform={s.t}>
      <g transform="translate(2.6 3.8)" fill="#1a1204">
        <path d={outer} fillOpacity="0.14" transform="translate(1 1)" />
        <path d={outer} fillOpacity="0.28" />
      </g>
      <defs>
        <linearGradient id={g} x1={r2(-s.W)} y1={r2(by - s.L)} x2={r2(s.W)} y2={by} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#2a2008" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {layers.map((l, k) => (
        <path key={k} d={l.d} fill={l.color} stroke={k === 0 ? '#2f3a10' : '#6a6a2a'} strokeOpacity={k === 0 ? 0.55 : 0.4} strokeWidth={k === 0 ? 1.6 : 1.1} />
      ))}
      <path d={tips} fill="#4a3c12" fillOpacity="0.35" />
      <path d={fuzz} fill="none" stroke="#9a5f82" strokeOpacity="0.45" strokeWidth="1.1" strokeLinecap="round" />
      <path d={outer} fill={`url(#${g})`} />
      <path d={`M${r2(-s.W * 0.86)} ${r2(by - s.L * 0.3)}C${r2(-s.W * 0.9)} ${r2(by - s.L * 0.5)} ${r2(-s.W * 0.6)} ${r2(by - s.L * 0.72)} ${r2(-s.W * 0.3)} ${r2(by - s.L * 0.84)}`} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2.6" strokeLinecap="round" />
      <Sparkle x={r2(-s.W * 0.62)} y={r2(by - s.L * 0.6)} r={1.7} o={0.65} />
      <Sparkle x={r2(-s.W * 0.12)} y={r2(heartY - 2)} r={1.3} o={0.6} />
    </g>
  );
}

// ── Pomodorini: halved cherry tomatoes, slightly collapsed from baking ────────────
const TOMATO = [
  { skin: ['#ff6a4a', '#e0261a', '#9c120a'], jelly: '#ff9c6a', seed: '#f8e08a', core: '#ff8a6a' },
  { skin: ['#ff6448', '#d9221a', '#93100a'], jelly: '#ffa070', seed: '#f6dc86', core: '#ff8e70' },
  { skin: ['#ffe46a', '#f4b21c', '#b97806'], jelly: '#fff0a0', seed: '#fff7d0', core: '#ffe08a' },
  { skin: ['#ff7a58', '#de2818', '#8e0f08'], jelly: '#ff9c6a', seed: '#f8e08a', core: '#ff8a6a' },
];

function Pomodorini({ variant, uid }: PieceProps) {
  const c = TOMATO[variant] ?? TOMATO[0]!;
  const g = idFor(uid, 'pom', variant);
  const squash = [0.94, 1, 0.92, 0.95][variant] ?? 1;
  const body = blobPath(43, 0.045, `pomodorini-${variant}-body`, 12, squash);
  const wall = blobPath(36, 0.06, `pomodorini-${variant}-wall`, 12, squash);
  const skinUp = variant === 3;
  const n = variant === 1 ? 2 : 3;
  const off0 = variant === 1 ? 0 : -90;
  const locules = Array.from({ length: n }, (_, i) => {
    const a = off0 + (i * 360) / n + 180 / n;
    const p = onCircle(0, 0, 17, a);
    return { x: r2(p.x * squash), y: p.y, a: Math.round(a), rx: n === 2 ? 15 : 13, ry: n === 2 ? 11 : 9.5 };
  });
  const seeds = locules.flatMap((l, i) => scatterDots(`pomodorini-${variant}-seeds-${i}`, 4, 6, 1.4, 2.1).map((dt) => ({ ...dt, x: r2(dt.x + l.x), y: r2(dt.y + l.y) })));
  const wrinkles = 'M18 -30C24 -24 26 -16 25 -8M-30 18C-24 24 -16 28 -6 29M30 14C26 22 20 27 12 30';
  return (
    <>
      <Shadow rx={r2(43 * squash)} ry={43} />
      <defs>
        <radialGradient id={`${g}-s`} cx="-14" cy="-16" r="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.skin[0]} />
          <stop offset="0.55" stopColor={c.skin[1]} />
          <stop offset="1" stopColor={c.skin[2]} />
        </radialGradient>
      </defs>
      <path d={body} fill={`url(#${g}-s)`} />
      {skinUp ? (
        <>
          <path d={wrinkles} fill="none" stroke={c.skin[2]} strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M20 -28C25 -22 27 -15 26.5 -8M-28 20C-22 25 -15 28.5 -7 29.5" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M-4 -3l3 -4l2 4l4 1l-4 2l-1 4l-2 -4l-4 -1Z" fill="#7a5a14" fillOpacity="0.6" />
        </>
      ) : (
        <>
          <path d={wall} fill={c.skin[1]} />
          <path d={wall} fill="none" stroke={c.skin[0]} strokeOpacity="0.6" strokeWidth="2.4" />
          {locules.map((l, i) => (
            <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.a} ${l.x} ${l.y})`} fill={c.jelly} fillOpacity="0.75" />
          ))}
          <path d={dotsPath(seeds)} fill={c.seed} fillOpacity="0.95" stroke={c.skin[2]} strokeOpacity="0.25" strokeWidth="0.6" />
          <ellipse cx="0" cy="0" rx="6.5" ry="6" fill={c.core} fillOpacity="0.9" />
          <path d={wall} fill="none" stroke={c.skin[2]} strokeOpacity="0.25" strokeWidth="1" />
        </>
      )}
      <path d={body} fill="none" stroke={c.skin[2]} strokeOpacity="0.65" strokeWidth="1.8" />
      <path d={`M${r2(-33 * squash)} -18A40 40 0 0 1 -6 -39`} fill="none" stroke="#fff" strokeOpacity={skinUp ? 0.55 : 0.4} strokeWidth={skinUp ? 5 : 3} strokeLinecap="round" />
      <Sparkle x={r2(-24 * squash)} y={-28} r={skinUp ? 3 : 2} o={0.75} />
    </>
  );
}

// ── Rucola: fresh rocket leaves (after the bake), lobed and bright ────────────────
const ROCKET = [
  [
    { x: -6, y: 40, rot: -32, len: 68, w: 36, lobes: 3 },
    { x: 6, y: 40, rot: 36, len: 64, w: 34, lobes: 3 },
    { x: 0, y: 44, rot: 2, len: 78, w: 38, lobes: 4 },
  ],
  [
    { x: -22, y: 30, rot: 26, len: 64, w: 34, lobes: 3 },
    { x: 18, y: 34, rot: -28, len: 66, w: 34, lobes: 3 },
    { x: 24, y: -10, rot: -104, len: 48, w: 28, lobes: 2 },
    { x: -6, y: 42, rot: 6, len: 74, w: 36, lobes: 4 },
  ],
  [
    { x: -12, y: -34, rot: 160, len: 48, w: 26, lobes: 2 },
    { x: 18, y: -32, rot: -156, len: 46, w: 26, lobes: 2 },
    { x: -28, y: 18, rot: 60, len: 58, w: 30, lobes: 3 },
    { x: 28, y: 22, rot: -56, len: 60, w: 30, lobes: 3 },
    { x: 0, y: 44, rot: -6, len: 66, w: 34, lobes: 3 },
  ],
  [
    { x: 14, y: 38, rot: 26, len: 64, w: 34, lobes: 3 },
    { x: -8, y: 40, rot: -14, len: 80, w: 38, lobes: 4 },
  ],
];

function Rucola({ variant, uid }: PieceProps) {
  const leaves = ROCKET[variant] ?? ROCKET[0]!;
  const g = idFor(uid, 'ruc', variant);
  return (
    <>
      <defs>
        <linearGradient id={g} x1="-14" y1="0" x2="14" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2c7a20" />
          <stop offset="0.45" stopColor="#5cae3a" />
          <stop offset="0.75" stopColor="#74c24c" />
          <stop offset="1" stopColor="#367f26" />
        </linearGradient>
      </defs>
      {leaves.map((l, i) => {
        const d = rocketLeaf(l.len, l.w, l.lobes, `rucola-${variant}-${i}`);
        const h = l.len / 2;
        const veins = Array.from({ length: l.lobes }, (_, k) => {
          const y = r2(h - ((k + 0.5) / (l.lobes + 0.6)) * l.len);
          const dx = r2(l.w * 0.2);
          return `M0 ${y}Q${r2(-dx * 0.5)} ${r2(y - 3)} ${-dx} ${r2(y - 7)}M0 ${y}Q${r2(dx * 0.5)} ${r2(y - 4)} ${dx} ${r2(y - 8)}`;
        }).join('');
        return (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rot}) translate(0 ${r2(-h)})`}>
            <path d={d} transform="translate(2.2 3)" fill="#0d1a08" fillOpacity="0.26" />
            <path d={d} fill={`url(#${g})`} />
            <path d={d} fill="none" stroke="#1d5a16" strokeOpacity="0.45" strokeWidth="1.1" strokeLinejoin="round" />
            <path d={`M0 ${r2(h + 6)}L0 ${r2(-h * 0.7)}${veins}`} fill="none" stroke="#d6f0b0" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
            <path d={`M-4 ${r2(-h * 0.7)}C-7 ${r2(-h * 0.3)} -7 ${r2(h * 0.1)} -4 ${r2(h * 0.4)}`} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        );
      })}
    </>
  );
}

// ── Spinaci: dark, wilted, glossy leaves ─────────────────────────────────────────
function SpinachLeaf({ uid, variant, i, x = 0, y = 0, rot = 0, scale = 1, light = false }: { uid: string; variant: number; i: number; x?: number; y?: number; rot?: number; scale?: number; light?: boolean }) {
  const d = blobPath(38, variant === 3 ? 0.13 : 0.09, `spinaci-${variant}-${i}`, 16, 0.74);
  const g = idFor(uid, 'spi', variant, i);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <path d={d} transform="translate(2.4 3.4)" fill="#0a1406" fillOpacity="0.3" />
      <defs>
        <radialGradient id={g} cx="-10" cy="-14" r="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={light ? '#5f9a3e' : '#4c8a34'} />
          <stop offset="0.55" stopColor={light ? '#2f6a22' : '#245a1c'} />
          <stop offset="1" stopColor="#0f3410" />
        </radialGradient>
      </defs>
      <path d="M0 36L2 47" stroke="#4f8a34" strokeWidth="3.2" strokeLinecap="round" />
      <path d={d} fill={`url(#${g})`} />
      <path d={d} fill="none" stroke="#0a2608" strokeOpacity="0.5" strokeWidth="1.3" />
      <path d="M0 36C-1 14 -1 -12 1 -34M0 18C-8 12 -16 8 -22 2M0 18C8 12 15 8 21 3M0 0C-7 -6 -14 -10 -19 -16M0 0C7 -6 14 -10 19 -15M0 -16C-4 -21 -8 -25 -11 -29M0 -16C4 -21 8 -25 11 -29" fill="none" stroke="#9ccc78" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M-14 22C-10 26 -4 27 2 26M10 -24C14 -20 16 -14 15 -8M-18 -6C-20 -1 -20 5 -18 10" fill="none" stroke="#06200a" strokeOpacity="0.32" strokeWidth="2" strokeLinecap="round" />
      <path d="M-16 -18C-12 -26 -6 -30 0 -31M8 6C12 10 14 14 14 19" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.6" strokeLinecap="round" />
      <Sparkle x={-11} y={-22} r={1.6} o={0.55} />
    </g>
  );
}

function Spinaci({ variant, uid }: PieceProps) {
  if (variant === 1) {
    return (
      <>
        <SpinachLeaf uid={uid} variant={1} i={0} x={-4} y={2} rot={-18} />
        <SpinachLeaf uid={uid} variant={1} i={1} x={10} y={-4} rot={34} scale={0.62} light />
      </>
    );
  }
  if (variant === 2) {
    return (
      <>
        <SpinachLeaf uid={uid} variant={2} i={0} x={-14} y={6} rot={-38} scale={0.76} />
        <SpinachLeaf uid={uid} variant={2} i={1} x={16} y={-4} rot={42} scale={0.72} light />
      </>
    );
  }
  if (variant === 3) return <SpinachLeaf uid={uid} variant={3} i={0} rot={12} scale={0.88} />;
  return <SpinachLeaf uid={uid} variant={0} i={0} />;
}

// ── Mais: a little cluster of plump golden kernels ───────────────────────────────
const KERNEL = 'M-12 -15C-5 -18 5 -18 12 -15C15.5 -6 14 6 9 14C4 18.5 -4 18.5 -9 14C-14 6 -15.5 -6 -12 -15Z';
const CORN = [
  [{ x: -16, y: -8, r: -12 }, { x: 15, y: -10, r: 14 }, { x: 0, y: 17, r: 178 }],
  [{ x: -16, y: -14, r: -8 }, { x: 15, y: -14, r: 10 }, { x: -15, y: 17, r: 186 }, { x: 16, y: 16, r: 172 }],
  [{ x: 0, y: -24, r: 2 }, { x: -24, y: -2, r: -70 }, { x: 24, y: -2, r: 72 }, { x: -12, y: 24, r: 200 }, { x: 13, y: 24, r: 160 }],
  [{ x: -24, y: -6, r: -20 }, { x: 0, y: -12, r: 4 }, { x: 24, y: -4, r: 24 }, { x: 4, y: 20, r: 176 }],
];

function Mais({ variant, uid }: PieceProps) {
  const kernels = CORN[variant] ?? CORN[0]!;
  const g = idFor(uid, 'mai', variant);
  const s = [1.25, 1.12, 1, 1.05][variant] ?? 1;
  return (
    <>
      <defs>
        <radialGradient id={g} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff0a0" />
          <stop offset="0.45" stopColor="#ffd04a" />
          <stop offset="0.85" stopColor="#efa91e" />
          <stop offset="1" stopColor="#c8860e" />
        </radialGradient>
      </defs>
      <g transform={`scale(${s})`}>
        {kernels.map((k, i) => (
          <path key={`s${i}`} d={KERNEL} transform={`translate(${k.x + 2.4} ${k.y + 3.4}) rotate(${k.r})`} fill="#2a1804" fillOpacity="0.4" />
        ))}
        {kernels.map((k, i) => (
          <g key={i} transform={`translate(${k.x} ${k.y}) rotate(${k.r})`}>
            <path d={KERNEL} fill={`url(#${g})`} stroke="#8a5206" strokeOpacity="0.7" strokeWidth="1.4" />
            <path d="M-5 4C-4 10 4 10 5 4C5 0 -5 0 -5 4Z" fill="#fff4c0" fillOpacity="0.45" />
            <path d="M-6 -12C-2 -14 3 -14 6 -12C3 -10 -3 -10 -6 -12Z" fill="#a8680a" fillOpacity="0.45" />
            <path d="M-8 -6C-8 -10 -5 -12 -2 -12" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </>
  );
}

// ── Patatine fritte: golden fried sticks, two or three crossing ──────────────────
const FRIES = [
  [
    { x: 0, y: -8, rot: -18, len: 84 },
    { x: 2, y: 10, rot: 24, len: 76 },
  ],
  [
    { x: -4, y: -14, rot: -32, len: 74 },
    { x: 4, y: 2, rot: 8, len: 84 },
    { x: 0, y: 14, rot: 52, len: 64 },
  ],
  [
    { x: -2, y: -9, rot: 6, len: 86 },
    { x: 4, y: 9, rot: 14, len: 66 },
  ],
  [
    { x: -6, y: -6, rot: -48, len: 66 },
    { x: 6, y: -2, rot: 40, len: 70 },
    { x: 0, y: 14, rot: -4, len: 58 },
  ],
];

function Patatine({ variant, uid }: PieceProps) {
  const sticks = FRIES[variant] ?? FRIES[0]!;
  const g = idFor(uid, 'pat', variant);
  const hw = 6.4;
  const R = 240;
  return (
    <>
      <defs>
        <linearGradient id={g} x1="0" y1={-hw - 1} x2="0" y2={hw + 3} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c98a28" />
          <stop offset="0.25" stopColor="#f2cc6a" />
          <stop offset="0.5" stopColor="#ffe9a6" />
          <stop offset="0.78" stopColor="#efc055" />
          <stop offset="1" stopColor="#b0701a" />
        </linearGradient>
      </defs>
      {sticks.map((st, i) => {
        const span = ((st.len / R) * 180) / Math.PI;
        const a0 = -90 - span / 2;
        const a1 = -90 + span / 2;
        const o = { cx: 0, cy: R, R, hw, a0, a1 };
        const d = arcBand({ ...o, seed: `patatine-${variant}-${i}`, wobble: 0.08, taper: 0.06, steps: 8 });
        const ends = dotsPath([...bandDots(`patatine-${variant}-${i}-a`, 3, { ...o, a1: a0 + 2.5 }, 1.8, 3.4, 0.2), ...bandDots(`patatine-${variant}-${i}-b`, 3, { ...o, a0: a1 - 2.5 }, 1.8, 3.4, 0.2)]);
        return (
          <g key={i} transform={`translate(${st.x} ${st.y}) rotate(${st.rot + (i % 2 ? 180 : 0)})`}>
            <path d={d} transform={i % 2 ? 'translate(-2.6 -3.6)' : 'translate(2.6 3.6)'} fill="#2a1604" fillOpacity="0.3" />
            <path d={d} fill={`url(#${g})`} />
            <path d={ends} fill="#8a4e10" fillOpacity="0.4" />
            <path d={d} fill="none" stroke="#8a5212" strokeOpacity="0.55" strokeWidth="1.4" strokeLinejoin="round" />
            <path d={arcD(0, R, R + 1.2, a0 + span * 0.12, a0 + span * 0.62)} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        );
      })}
    </>
  );
}

export const vegArt: IngredientArt[] = [
  { slug: 'funghi', sizeCm: 4.4, density: 14, scatter: 'discrete', layer: 30, variants: 3, rotation: 'free', scaleJitter: 0.12, Piece: Funghi },
  { slug: 'basilico', sizeCm: 5, density: 4, scatter: 'discrete', layer: 35, variants: 3, rotation: 'free', scaleJitter: 0.14, Piece: Basilico },
  { slug: 'olive-nere', sizeCm: 2.5, density: 17, scatter: 'discrete', layer: 30, variants: 3, rotation: 'free', scaleJitter: 0.08, Piece: OliveNere },
  { slug: 'peperoni', sizeCm: 6, density: 8, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Peperoni },
  { slug: 'cipolla', sizeCm: 4, density: 12, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Cipolla },
  { slug: 'melanzane', sizeCm: 3.6, density: 9, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Melanzane },
  { slug: 'zucchine', sizeCm: 3.4, density: 11, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.1, Piece: Zucchine },
  { slug: 'carciofi', sizeCm: 3.8, density: 8, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Carciofi },
  { slug: 'pomodorini', sizeCm: 2.8, density: 12, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.1, Piece: Pomodorini },
  { slug: 'rucola', sizeCm: 6, density: 5, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Rucola },
  { slug: 'spinaci', sizeCm: 4.5, density: 6, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Spinaci },
  { slug: 'mais', sizeCm: 1.8, density: 24, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Mais },
  { slug: 'patatine', sizeCm: 5, density: 9, scatter: 'discrete', layer: 30, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Patatine },
];
