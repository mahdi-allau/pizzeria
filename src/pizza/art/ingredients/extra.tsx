import { createRng } from '../../rng';
import { blobPath, dotsPath, r2, scatterDots, type Dot, type Pt } from '../shapes';
import { Shadow, Sparkle, idFor } from '../parts';
import type { IngredientArt, LayerProps, PieceProps } from '../../types';
import { offsetLine, ribbonOutline, shardPath, smoothOpenPath } from './helpers-fish-extra';
import { smoothClosedPath } from '../shapes';

/**
 * Extra: uovo, origano, peperoncino, olio-evo (drizzle), pistacchio, tartufo.
 * Sprinkles are tiny clusters of 2–4 flakes per piece (the engine scatters up to ~180 of them); the oil is one
 * continuous Layer drawn from the pizza seed. After-bake items (oil, pistachio, truffle) stay fresh and glossy.
 */

// ── Uovo: a fried egg with crisp, lacy golden edges ──────────────────────────────
const EGGS = [
  { yx: -3, yy: -2, squash: 1, yr: 15.5 },
  { yx: 5, yy: -6, squash: 0.9, yr: 16 },
  { yx: -7, yy: 4, squash: 1.06, yr: 15 },
];

function Uovo({ variant, uid }: PieceProps) {
  const e = EGGS[variant] ?? EGGS[0]!;
  const lace = blobPath(47, 0.11, `uovo-${variant}-lace`, 22, e.squash);
  const crisp = blobPath(45, 0.09, `uovo-${variant}-crisp`, 18, e.squash);
  const white = blobPath(41, 0.08, `uovo-${variant}-white`, 15, e.squash);
  const bubbles = dotsPath(scatterDots(`uovo-${variant}-bub`, 14, 40, 0.6, 1.8, 30));
  const gw = idFor(uid, 'uov', variant, 'w');
  const gy = idFor(uid, 'uov', variant, 'y');
  const gl = idFor(uid, 'uov', variant, 'l');
  const { yx, yy, yr } = e;
  return (
    <>
      <Shadow rx={46 * e.squash} ry={46} o={0.22} />
      <defs>
        <radialGradient id={gl} cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0.82" stopColor="#f0c878" />
          <stop offset="0.94" stopColor="#d99a48" />
          <stop offset="1" stopColor="#a8682a" />
        </radialGradient>
        <radialGradient id={gw} cx={yx} cy={yy} r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffefa" />
          <stop offset="0.6" stopColor="#fbf5ea" />
          <stop offset="0.9" stopColor="#efe2c8" />
          <stop offset="1" stopColor="#e2c99c" />
        </radialGradient>
        <radialGradient id={gy} cx={yx - yr * 0.35} cy={yy - yr * 0.4} r={yr * 1.35} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe07a" />
          <stop offset="0.45" stopColor="#ffb52e" />
          <stop offset="1" stopColor="#e0790f" />
        </radialGradient>
      </defs>
      <path d={lace} fill={`url(#${gl})`} />
      <path d={lace} fill="none" stroke="#8a5220" strokeOpacity="0.35" strokeWidth="1.1" strokeDasharray="3 1.6" />
      <path d={crisp} fill="#f2dcae" fillOpacity="0.85" />
      <path d={white} fill={`url(#${gw})`} />
      <path d={bubbles} fill="#d9b880" fillOpacity="0.45" />
      <path d="M-34 -14C-30 -26 -20 -34 -8 -37" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
      {/* Thick albumen around the yolk, then the domed yolk. */}
      <circle cx={yx + 1} cy={yy + 1.5} r={yr + 6} fill="#fff" fillOpacity="0.6" />
      <circle cx={yx + 1.6} cy={yy + 2.4} r={yr} fill="#b8641a" fillOpacity="0.25" />
      <circle cx={yx} cy={yy} r={yr} fill={`url(#${gy})`} />
      <circle cx={yx} cy={yy} r={yr - 0.6} fill="none" stroke="#c4620c" strokeOpacity="0.45" strokeWidth="1.2" />
      <ellipse cx={r2(yx - yr * 0.38)} cy={r2(yy - yr * 0.42)} rx={r2(yr * 0.34)} ry={r2(yr * 0.2)} transform={`rotate(-35 ${r2(yx - yr * 0.38)} ${r2(yy - yr * 0.42)})`} fill="#fff" fillOpacity="0.65" />
      <Sparkle x={r2(yx + yr * 0.32)} y={r2(yy + yr * 0.38)} r={1.2} o={0.35} />
      <Sparkle x={-22} y={-28} r={1.6} o={0.7} />
    </>
  );
}

// ── Sprinkles: clusters of tiny flakes ───────────────────────────────────────────
interface FlakeSpec {
  palette: string[];
  count: [number, number];
  radius: [number, number];
  sides: [number, number];
  elongation: [number, number];
  spread: number;
}

function flakes(seed: string, spec: FlakeSpec) {
  const rng = createRng(seed);
  const n = spec.count[0] + rng.int(spec.count[1] - spec.count[0] + 1);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.5, 0.5);
    const d = i === 0 ? rng.range(0, 6) : rng.range(spec.spread * 0.45, spec.spread);
    const x = r2(Math.cos(a) * d);
    const y = r2(Math.sin(a) * d);
    const r = rng.range(spec.radius[0], spec.radius[1]);
    const sides = spec.sides[0] + rng.int(spec.sides[1] - spec.sides[0] + 1);
    const elong = rng.range(spec.elongation[0], spec.elongation[1]);
    const ang = rng.range(0, Math.PI);
    return { x, y, r: r2(r), d: shardPath(`${seed}-${i}`, x, y, r, sides, elong, ang), color: rng.pick(spec.palette), i };
  });
}

const OREGANO: FlakeSpec = {
  palette: ['#6f7a35', '#59652a', '#7d7a3c', '#4c5522', '#8a8445'],
  count: [2, 4],
  radius: [8, 15],
  sides: [4, 6],
  elongation: [1, 1.6],
  spread: 30,
};

function Origano({ variant }: PieceProps) {
  const fl = flakes(`origano-${variant}`, OREGANO);
  return (
    <>
      <g fill="#1a1204" fillOpacity="0.22" transform="translate(2 3)">
        {fl.map((f) => <path key={f.i} d={f.d} />)}
      </g>
      {fl.map((f) => <path key={f.i} d={f.d} fill={f.color} />)}
      <path d={fl.map((f) => `M${r2(f.x - f.r * 0.5)} ${r2(f.y)}L${r2(f.x + f.r * 0.4)} ${r2(f.y - f.r * 0.2)}`).join('')} stroke="#b8b46a" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

const CHILLI: FlakeSpec = {
  palette: ['#d6361c', '#c22a14', '#e2501e', '#b8240f', '#e8662a'],
  count: [2, 3],
  radius: [11, 18],
  sides: [5, 8],
  elongation: [1.1, 1.8],
  spread: 26,
};

function Peperoncino({ variant, uid }: PieceProps) {
  const fl = flakes(`peperoncino-${variant}`, CHILLI);
  const rng = createRng(`peperoncino-${variant}-seed`);
  const seeds = Array.from({ length: variant % 2 === 0 ? 2 : 1 }, () => ({ x: r2(rng.range(-28, 28)), y: r2(rng.range(-28, 28)), a: r2(rng.range(0, 180)) }));
  const g = idFor(uid, 'pep', variant);
  return (
    <>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#4a0802" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <g fill="#1a0602" fillOpacity="0.25" transform="translate(2 3)">
        {fl.map((f) => <path key={f.i} d={f.d} />)}
      </g>
      {fl.map((f) => (
        <g key={f.i}>
          <path d={f.d} fill={f.color} />
          <path d={f.d} fill={`url(#${g})`} stroke="#7a1206" strokeOpacity="0.45" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      ))}
      {seeds.map((s, i) => (
        <g key={`s${i}`} transform={`translate(${s.x} ${s.y}) rotate(${s.a})`}>
          <ellipse rx="5.2" ry="3.8" fill="#f3e2b0" stroke="#c9a868" strokeWidth="1" />
          <ellipse cx="-1.5" cy="-1.1" rx="2.2" ry="1.2" fill="#fff" fillOpacity="0.6" />
        </g>
      ))}
      <path d={fl.map((f) => `M${r2(f.x - f.r * 0.45)} ${r2(f.y - f.r * 0.25)}L${r2(f.x + f.r * 0.1)} ${r2(f.y - f.r * 0.45)}`).join('')} stroke="#fff" strokeOpacity="0.6" strokeWidth="1.8" strokeLinecap="round" />
    </>
  );
}

const PISTACHIO: FlakeSpec = {
  palette: ['#86b23c', '#9cc24f', '#6e9a2c', '#a9c95c', '#7aa834'],
  count: [2, 4],
  radius: [10, 17],
  sides: [5, 7],
  elongation: [1, 1.4],
  spread: 28,
};

function Pistacchio({ variant }: PieceProps) {
  const fl = flakes(`pistacchio-${variant}`, PISTACHIO);
  const rng = createRng(`pistacchio-${variant}-face`);
  return (
    <>
      <g fill="#14200a" fillOpacity="0.24" transform="translate(2 3)">
        {fl.map((f) => <path key={f.i} d={f.d} />)}
      </g>
      {fl.map((f) => {
        const face = rng.next();
        // Some crumbs show the cream-yellow inside, one in a while keeps a bit of purple skin.
        const fill = face < 0.3 ? '#e4d98a' : face < 0.4 ? '#8c5a62' : f.color;
        return (
          <g key={f.i}>
            <path d={f.d} fill={fill} stroke="#4f7420" strokeOpacity="0.4" strokeWidth="1.1" strokeLinejoin="round" />
            {face >= 0.4 && <path d={shardPath(`pistacchio-${variant}-in-${f.i}`, r2(f.x + 1.5), r2(f.y + 1.5), f.r * 0.5, 5, 1.2, 0.4)} fill="#d6e08a" fillOpacity="0.75" />}
          </g>
        );
      })}
      <path d={fl.map((f) => `M${r2(f.x - f.r * 0.5)} ${r2(f.y - f.r * 0.2)}L${r2(f.x - f.r * 0.05)} ${r2(f.y - f.r * 0.5)}`).join('')} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

// ── Tartufo: glossy dollops of black-truffle cream ───────────────────────────────
function Tartufo({ variant, uid }: PieceProps) {
  const g = idFor(uid, 'tar', variant);
  const blobs: Array<{ d: string; x: number; y: number; r: number }> = [];
  if (variant === 0) blobs.push({ d: blobPath(40, 0.12, 'tartufo-0-a', 11), x: 0, y: 0, r: 40 });
  if (variant === 1) blobs.push({ d: blobPath(36, 0.14, 'tartufo-1-a', 11, 1.3), x: 0, y: 0, r: 36 });
  if (variant === 2) {
    const center: Pt[] = Array.from({ length: 9 }, (_, i) => ({ x: r2(-36 + i * 9), y: r2(Math.sin(i * 0.7) * 6) }));
    const outline = ribbonOutline(center, (t) => 20 * (1 - 0.55 * t) * (t < 0.1 ? 0.7 + 3 * t : 1));
    blobs.push({ d: `${smoothClosedPath(outline)}Z`, x: 0, y: 0, r: 22 });
  }
  if (variant === 3) {
    blobs.push({ d: blobPath(26, 0.14, 'tartufo-3-a', 10), x: -13, y: -8, r: 26 });
    blobs.push({ d: blobPath(19, 0.16, 'tartufo-3-b', 9), x: 20, y: 16, r: 19 });
  }
  const specks = dotsPath(scatterDots(`tartufo-${variant}-sp`, 22, 30, 0.5, 1.4).map((d: Dot) => ({ ...d, x: r2(d.x * (variant === 2 ? 1.2 : 1)), y: r2(d.y * (variant === 2 ? 0.5 : 1)) })));
  const lights = dotsPath(scatterDots(`tartufo-${variant}-li`, 10, 28, 0.4, 0.9));
  return (
    <>
      <g fill="#0a0503" fillOpacity="0.3" transform="translate(2.6 3.6)">
        {blobs.map((b, i) => <path key={i} d={b.d} transform={`translate(${b.x} ${b.y})`} />)}
      </g>
      <defs>
        <radialGradient id={g} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#77583f" />
          <stop offset="0.45" stopColor="#422c1d" />
          <stop offset="1" stopColor="#170d08" />
        </radialGradient>
      </defs>
      {blobs.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y})`}>
          <path d={b.d} fill={`url(#${g})`} />
          <path d={b.d} fill="none" stroke="#0c0604" strokeOpacity="0.5" strokeWidth="1.6" />
          <path d={`M${r2(-b.r * 0.72)} ${r2(-b.r * 0.1)}C${r2(-b.r * 0.66)} ${r2(-b.r * 0.5)} ${r2(-b.r * 0.35)} ${r2(-b.r * 0.72)} ${r2(b.r * 0.05)} ${r2(-b.r * 0.72)}`} fill="none" stroke="#c9a88a" strokeOpacity="0.32" strokeWidth={r2(b.r * 0.16)} strokeLinecap="round" />
          <path d={`M${r2(-b.r * 0.5)} ${r2(-b.r * 0.32)}C${r2(-b.r * 0.4)} ${r2(-b.r * 0.5)} ${r2(-b.r * 0.2)} ${r2(-b.r * 0.58)} ${r2(b.r * 0.02)} ${r2(-b.r * 0.58)}`} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
          {/* A soft swirl, like the spoon that put it there. */}
          <path d={`M${r2(-b.r * 0.2)} ${r2(b.r * 0.15)}C${r2(b.r * 0.1)} ${r2(-b.r * 0.15)} ${r2(b.r * 0.45)} ${r2(b.r * 0.05)} ${r2(b.r * 0.3)} ${r2(b.r * 0.4)}`} fill="none" stroke="#7a5c48" strokeOpacity="0.35" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      ))}
      <path d={specks} fill="#050302" fillOpacity="0.75" />
      <path d={lights} fill="#d8bfa4" fillOpacity="0.35" />
      <Sparkle x={r2(blobs[0]!.x - blobs[0]!.r * 0.3)} y={r2(blobs[0]!.y - blobs[0]!.r * 0.5)} r={1.6} o={0.75} />
    </>
  );
}

// ── Olio extravergine: a loopy, glossy drizzle across the whole pizza ────────────
function oilLine(rng: ReturnType<typeof createRng>, radius: number, baseAngle: number): Pt[] {
  const reach = radius * rng.range(0.7, 0.84);
  const shift = radius * rng.range(-0.3, 0.3);
  const ca = Math.cos(baseAngle);
  const sa = Math.sin(baseAngle);
  const waves = rng.range(1, 1.8);
  const wavePhase = rng.range(0, Math.PI * 2);
  const waveAmp = radius * rng.range(0.08, 0.14);
  const loops = 2 + rng.int(3);
  const loopR = radius * rng.range(0.07, 0.1);
  const loopPhase = rng.range(0, Math.PI * 2);
  const pts: Pt[] = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const along = -reach + 2 * reach * t;
    const side = shift + waveAmp * Math.sin(t * Math.PI * 2 * waves + wavePhase);
    const la = t * Math.PI * 2 * loops + loopPhase;
    let x = along * ca - side * sa + Math.cos(la) * loopR;
    let y = along * sa + side * ca + Math.sin(la) * loopR;
    const d = Math.hypot(x, y);
    const max = radius * 0.86;
    if (d > max) {
      x = (x / d) * max;
      y = (y / d) * max;
    }
    pts.push({ x: r2(x), y: r2(y) });
  }
  return pts;
}

function OlioLayer({ seed, portions, radius }: LayerProps) {
  const rng = createRng(`olio-evo-${seed}`);
  const count = Math.min(4, (portions > 1 ? 3 : 2) + (rng.next() < 0.5 ? 1 : 0));
  const start = rng.range(0, Math.PI);
  const lines = Array.from({ length: count }, (_, j) => oilLine(rng.fork(`l${j}`), radius, start + (j * Math.PI) / count + rng.range(-0.25, 0.25)));
  const paths = lines.map((l) => smoothOpenPath(l));
  const all = paths.join('');
  // Droplets that fell off the line.
  const drops: Dot[] = [];
  lines.forEach((l, j) => {
    const r = rng.fork(`d${j}`);
    for (let k = 0; k < 4; k++) {
      const p = l[r.int(l.length)]!;
      drops.push({ x: r2(p.x + r.range(-18, 18)), y: r2(p.y + r.range(-18, 18)), r: r2(r.range(3.5, 8)) });
    }
  });
  const dropLights = drops.map((d) => ({ x: r2(d.x - d.r * 0.35), y: r2(d.y - d.r * 0.35), r: r2(d.r * 0.32) }));
  const core = offsetLine(lines[0]!, () => -1.6, 0.1, 0.9);
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={all} stroke="#4a3a04" strokeOpacity="0.18" strokeWidth="20" transform="translate(2.5 3.5)" />
      <path d={all} stroke="#cfb22a" strokeOpacity="0.36" strokeWidth="21" />
      <path d={all} stroke="#a8901a" strokeOpacity="0.55" strokeWidth="11" />
      <path d={all} stroke="#d9c13a" strokeOpacity="0.7" strokeWidth="7" />
      <path d={all} stroke="#fbe97c" strokeOpacity="0.85" strokeWidth="3.4" />
      <path d={all} stroke="#fffbe6" strokeOpacity="0.9" strokeWidth="1.6" strokeDasharray="4 30" />
      <path d={smoothOpenPath(core)} stroke="#fff" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="14 40" />
      <path d={dotsPath(drops)} fill="#c8ad2c" fillOpacity="0.6" stroke="#9c8414" strokeOpacity="0.35" strokeWidth="0.8" />
      <path d={dotsPath(drops.map((d) => ({ ...d, r: r2(d.r * 0.6) })))} fill="#f0d95e" fillOpacity="0.55" />
      <path d={dotsPath(dropLights)} fill="#fff" fillOpacity="0.8" />
    </g>
  );
}

const Empty = () => <g />;

export const extraArt: IngredientArt[] = [
  { slug: 'uovo', sizeCm: 9, density: 1, scatter: 'center', layer: 60, variants: 3, rotation: 'free', scaleJitter: 0.06, Piece: Uovo },
  { slug: 'origano', sizeCm: 0.7, density: 60, scatter: 'sprinkle', layer: 60, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Origano },
  { slug: 'peperoncino', sizeCm: 0.8, density: 45, scatter: 'sprinkle', layer: 60, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Peperoncino },
  { slug: 'olio-evo', sizeCm: 1, density: 1, scatter: 'drizzle', layer: 60, variants: 1, rotation: 'none', Piece: Empty, Layer: OlioLayer },
  { slug: 'pistacchio', sizeCm: 0.9, density: 40, scatter: 'sprinkle', layer: 60, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Pistacchio },
  { slug: 'tartufo', sizeCm: 3, density: 8, scatter: 'discrete', layer: 60, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Tartufo },
];
