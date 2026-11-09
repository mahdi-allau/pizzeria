import { createRng } from '../../rng';
import { blobPath, dotsPath, r2, scatterDots, smoothClosedPath, type Pt } from '../shapes';
import { Shadow, Sparkle, idFor } from '../parts';
import type { IngredientArt, PieceProps } from '../../types';
import { deg, jitterPts, offsetLine, onCircle, ribbonOutline, scalePts, smoothOpenPath } from './helpers-fish-extra';

/**
 * Pesce (fish and seafood). Same layering as the reference pieces: contact shadow → gradient body → rim →
 * texture (fibres, bands, fat lines) → specular highlight → sparkle. Baked fish is glossy and a touch browned at the
 * edges; smoked salmon goes on after baking, so it stays bright, translucent and fresh.
 */

// ── Acciughe: an S-curved anchovy fillet ─────────────────────────────────────────
const FILLETS = [
  { len: 45, amp: 5, k: 1, ph: 0.2, w: 11 },
  { len: 43, amp: 7, k: 0.75, ph: 0.9, w: 11.6 },
  { len: 42, amp: 4, k: 1.3, ph: -0.5, w: 10.4 },
  { len: 40, amp: 10, k: 0.5, ph: 1.4, w: 12 },
];

function Acciughe({ variant, uid }: PieceProps) {
  const c = FILLETS[variant] ?? FILLETS[0]!;
  const center: Pt[] = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return { x: r2(-c.len + 2 * c.len * t), y: r2(c.amp * Math.sin((t * 2 - 1) * Math.PI * c.k + c.ph) - c.amp * 0.3 * Math.sin(c.ph)) };
  });
  const half = (t: number) => c.w * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * t)), 0.55) * (1 - 0.32 * t);
  const outline = `${smoothClosedPath(ribbonOutline(center, half))}Z`;
  const back = smoothOpenPath(offsetLine(center, (t) => -half(t) * 0.28, 0.06, 0.94));
  const belly = smoothOpenPath(offsetLine(center, (t) => half(t) * 0.62, 0.1, 0.9));
  const gloss = smoothOpenPath(offsetLine(center, (t) => -half(t) * 0.58, 0.16, 0.62));
  const gloss2 = smoothOpenPath(offsetLine(center, (t) => half(t) * 0.3, 0.55, 0.8));
  // Fine diagonal muscle fibres, batched in one path.
  const a = offsetLine(center, (t) => -half(t) * 0.75);
  const b = offsetLine(center, (t) => half(t) * 0.75);
  let fibres = '';
  for (let i = 1; i < center.length - 2; i++) fibres += `M${a[i]!.x} ${a[i]!.y}L${b[i + 1]!.x} ${b[i + 1]!.y}`;
  const g = idFor(uid, 'acc', variant);
  return (
    <>
      <g transform="translate(2.2 3.2)" fill="#1a0a04">
        <path d={outline} fillOpacity="0.16" transform="scale(1.06)" />
        <path d={outline} fillOpacity="0.26" />
      </g>
      <defs>
        <linearGradient id={g} x1="-40" y1="-14" x2="40" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c07a56" />
          <stop offset="0.45" stopColor="#9a5636" />
          <stop offset="1" stopColor="#713822" />
        </linearGradient>
      </defs>
      <path d={outline} fill={`url(#${g})`} />
      <path d={belly} fill="none" stroke="#ddd3cb" strokeOpacity="0.5" strokeWidth={r2(c.w * 0.55)} strokeLinecap="round" />
      <path d={back} fill="none" stroke="#4a2414" strokeOpacity="0.5" strokeWidth={r2(c.w * 0.42)} strokeLinecap="round" />
      <path d={back} fill="none" stroke="#2a130b" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />
      <path d={fibres} fill="none" stroke="#f0c8a8" strokeOpacity="0.32" strokeWidth="0.9" strokeLinecap="round" />
      <path d={outline} fill="none" stroke="#4b2416" strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={gloss} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
      <path d={gloss2} fill="none" stroke="#f6e9dc" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      <Sparkle x={a[4]!.x + 1} y={a[4]!.y + 1} r={1.4} o={0.7} />
    </>
  );
}

// ── Tonno: a flaky chunk of tuna ─────────────────────────────────────────────────
const TUNA_FLAKES: Array<Array<[number, number, number, number]>> = [
  // [x, y, radius, fibre angle°]
  [[-14, -8, 22, 20], [12, -12, 18, 60], [6, 14, 20, -10], [-16, 16, 13, 40]],
  [[-6, -6, 26, 35], [18, 8, 16, -20], [-20, 16, 12, 70]],
  [[-16, -2, 18, -30], [8, -16, 17, 10], [14, 10, 18, 50], [-4, 20, 13, -5], [-22, -20, 10, 80]],
  [[0, -4, 22, 0], [-20, 12, 15, 45], [18, 14, 14, -40]],
];

function Tonno({ variant, uid }: PieceProps) {
  const flakes = TUNA_FLAKES[variant] ?? TUNA_FLAKES[0]!;
  const rng = createRng(`tonno-${variant}-tone`);
  const gl = idFor(uid, 'ton', variant, 'l');
  const gd = idFor(uid, 'ton', variant, 'd');
  let fibres = '';
  let cracks = '';
  flakes.forEach(([x, y, r, ang], i) => {
    const ca = Math.cos(deg(ang));
    const sa = Math.sin(deg(ang));
    for (let k = -1; k <= 1; k++) {
      const ox = -sa * k * r * 0.38;
      const oy = ca * k * r * 0.38;
      const l = r * (0.75 - Math.abs(k) * 0.2);
      fibres += `M${r2(x + ox - ca * l)} ${r2(y + oy - sa * l)}Q${r2(x + ox + sa * 3)} ${r2(y + oy - ca * 3)} ${r2(x + ox + ca * l)} ${r2(y + oy + sa * l)}`;
    }
    if (i % 2 === 0) cracks += `M${r2(x - ca * r * 0.5 + 2)} ${r2(y - sa * r * 0.5 + 2)}L${r2(x + ca * r * 0.4)} ${r2(y + sa * r * 0.4 + 1)}`;
  });
  const flecks = dotsPath(scatterDots(`tonno-${variant}-fleck`, 9, 26, 0.8, 1.8));
  return (
    <>
      <g fill="#1a0a04" fillOpacity="0.3">
        {flakes.map(([x, y, r], i) => (
          <path key={i} d={blobPath(r, 0.2, `tonno-${variant}-f${i}`, 9, 1.1)} transform={`translate(${x + 2.4} ${y + 3.4})`} />
        ))}
      </g>
      <defs>
        <radialGradient id={gl} cx="0.32" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#f4dcc2" />
          <stop offset="0.5" stopColor="#ddb393" />
          <stop offset="1" stopColor="#b5845f" />
        </radialGradient>
        <radialGradient id={gd} cx="0.32" cy="0.28" r="0.85">
          <stop offset="0" stopColor="#d6a27e" />
          <stop offset="0.55" stopColor="#aa7450" />
          <stop offset="1" stopColor="#7c4c30" />
        </radialGradient>
      </defs>
      {flakes.map(([x, y, r], i) => {
        const d = blobPath(r, 0.2, `tonno-${variant}-f${i}`, 9, 1.1);
        const dark = rng.next() < 0.35;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d={d} fill={`url(#${dark ? gd : gl})`} />
            <path d={d} fill="none" stroke="#7a4e32" strokeOpacity="0.45" strokeWidth="1.6" strokeLinejoin="round" />
          </g>
        );
      })}
      <path d={fibres} fill="none" stroke="#8a5c3e" strokeOpacity="0.38" strokeWidth="1.1" strokeLinecap="round" />
      <path d={cracks} fill="none" stroke="#6a4028" strokeOpacity="0.4" strokeWidth="1.8" strokeLinecap="round" />
      <path d={flecks} fill="#8a5a3a" fillOpacity="0.45" />
      {flakes.slice(0, 2).map(([x, y, r], i) => (
        <path key={`h${i}`} d={`M${r2(x - r * 0.6)} ${r2(y - r * 0.15)}Q${r2(x - r * 0.5)} ${r2(y - r * 0.6)} ${r2(x - r * 0.05)} ${r2(y - r * 0.68)}`} fill="none" stroke="#fff" strokeOpacity="0.42" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <Sparkle x={flakes[0]![0] - flakes[0]![2] * 0.35} y={flakes[0]![1] - flakes[0]![2] * 0.42} r={1.7} o={0.6} />
    </>
  );
}

// ── Gamberetti: a curled, peeled shrimp ──────────────────────────────────────────
const SHRIMPS = [
  { R: 23, from: -205, to: 60, w: 12.5, cy: 3 },
  { R: 25, from: -190, to: 40, w: 11.5, cy: 5 },
  { R: 21, from: -215, to: 75, w: 13, cy: 2 },
  { R: 24, from: -180, to: 55, w: 12, cy: 4 },
];

function Gamberetti({ variant, uid }: PieceProps) {
  const s = SHRIMPS[variant] ?? SHRIMPS[0]!;
  const cx = 0;
  const cy = s.cy;
  const N = 18;
  const half = (t: number) => s.w * (1 - 0.62 * t) * (t < 0.08 ? 0.8 + 2.5 * t : 1);
  const ang = (t: number) => deg(s.from + (s.to - s.from) * t);
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    outer.push(onCircle(cx, cy, s.R + half(t), ang(t)));
    inner.push(onCircle(cx, cy, s.R - half(t) * 0.92, ang(t)));
  }
  const body = `${smoothClosedPath([...outer, ...inner.reverse()])}Z`;
  // Segment bands: crescents across the back, skipping the head cut and the tail.
  let bands = '';
  let bandLights = '';
  for (let k = 1; k <= 6; k++) {
    const t = 0.06 + k * 0.13;
    const p1 = onCircle(cx, cy, s.R - half(t) * 0.5, ang(t));
    const pm = onCircle(cx, cy, s.R + half(t) * 0.3, ang(t + 0.035));
    const p2 = onCircle(cx, cy, s.R + half(t) * 0.98, ang(t));
    bands += `M${p1.x} ${p1.y}Q${pm.x} ${pm.y} ${p2.x} ${p2.y}`;
    const q1 = onCircle(cx, cy, s.R - half(t) * 0.3, ang(t - 0.03));
    const qm = onCircle(cx, cy, s.R + half(t) * 0.3, ang(t + 0.0));
    const q2 = onCircle(cx, cy, s.R + half(t) * 0.9, ang(t - 0.03));
    bandLights += `M${q1.x} ${q1.y}Q${qm.x} ${qm.y} ${q2.x} ${q2.y}`;
  }
  const back = smoothOpenPath(Array.from({ length: 10 }, (_, i) => onCircle(cx, cy, s.R + half(0.08 + i * 0.08) * 0.62, ang(0.08 + i * 0.08))));
  const gloss = smoothOpenPath(Array.from({ length: 6 }, (_, i) => onCircle(cx, cy, s.R + half(0.1 + i * 0.07) * 0.25, ang(0.1 + i * 0.07))));
  // Head end: a cut face, browned at the rim.
  const head = onCircle(cx, cy, s.R, ang(0));
  const headA = r2(s.from + 90);
  // Tail fan at the other end.
  const tail = onCircle(cx, cy, s.R, ang(1));
  const tailA = r2(s.to + 90);
  const tw = half(1);
  const fan = `M0 ${r2(-tw)}C${r2(tw * 1.6)} ${r2(-tw * 2.6)} ${r2(tw * 3.6)} ${r2(-tw * 1.4)} ${r2(tw * 3.4)} 0C${r2(tw * 3.8)} ${r2(tw * 1.3)} ${r2(tw * 1.8)} ${r2(tw * 2.8)} 0 ${r2(tw)}Z`;
  const g = idFor(uid, 'gam', variant);
  const gt = idFor(uid, 'gam', variant, 't');
  const ro = s.R + s.w;
  return (
    <>
      <g transform="translate(2.2 3.2)" fill="#2a0e04">
        <path d={body} fillOpacity="0.28" />
      </g>
      <Shadow rx={8} dx={tail.x + 2} dy={tail.y + 3} o={0.18} />
      <defs>
        <radialGradient id={g} cx={cx} cy={cy} r={ro} gradientUnits="userSpaceOnUse">
          <stop offset={r2((s.R - s.w) / ro)} stopColor="#fde9dc" />
          <stop offset={r2((s.R - s.w * 0.2) / ro)} stopColor="#fbc3a2" />
          <stop offset={r2((s.R + s.w * 0.45) / ro)} stopColor="#f2865a" />
          <stop offset="1" stopColor="#d4532e" />
        </radialGradient>
        <linearGradient id={gt} x1="0" y1="0" x2={r2(tw * 3.6)} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2875c" />
          <stop offset="0.6" stopColor="#e0552f" />
          <stop offset="1" stopColor="#a9361b" />
        </linearGradient>
      </defs>
      <g transform={`translate(${tail.x} ${tail.y}) rotate(${tailA})`}>
        <path d={fan} fill={`url(#${gt})`} />
        <path d={fan} fill="none" stroke="#8e2c14" strokeOpacity="0.5" strokeWidth="1" />
        <path d={`M0 0L${r2(tw * 3.1)} ${r2(-tw * 1.2)}M0 0L${r2(tw * 3.3)} 0M0 0L${r2(tw * 3.1)} ${r2(tw * 1.2)}`} stroke="#ffd0b4" strokeOpacity="0.45" strokeWidth="0.8" />
      </g>
      <path d={body} fill={`url(#${g})`} />
      <path d={bands} fill="none" stroke="#c4492a" strokeOpacity="0.5" strokeWidth="1.7" strokeLinecap="round" />
      <path d={bandLights} fill="none" stroke="#ffe3d2" strokeOpacity="0.4" strokeWidth="1.1" strokeLinecap="round" />
      <path d={back} fill="none" stroke="#b33b1d" strokeOpacity="0.4" strokeWidth="2.2" strokeLinecap="round" />
      <path d={body} fill="none" stroke="#a53c1e" strokeOpacity="0.45" strokeWidth="1.3" strokeLinejoin="round" />
      <ellipse cx={head.x} cy={head.y} rx={r2(s.w * 0.95)} ry={r2(s.w * 0.45)} transform={`rotate(${headA} ${head.x} ${head.y})`} fill="#f7cdb2" stroke="#b5562e" strokeOpacity="0.6" strokeWidth="1.8" />
      <path d={gloss} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2.6" strokeLinecap="round" />
      <Sparkle x={onCircle(cx, cy, s.R + 2, ang(0.22)).x} y={onCircle(cx, cy, s.R + 2, ang(0.22)).y} r={1.6} o={0.7} />
    </>
  );
}

// ── Cozze: an open mussel half-shell with its plump flesh ────────────────────────
const SHELL: Pt[] = [
  { x: -46, y: 0 }, { x: -34, y: -12 }, { x: -12, y: -21 }, { x: 14, y: -24 }, { x: 34, y: -19 },
  { x: 45, y: -5 }, { x: 43, y: 10 }, { x: 28, y: 21 }, { x: 4, y: 22 }, { x: -20, y: 15 }, { x: -36, y: 8 },
];

function MusselHalf({ uid, variant, part, seed, sx, sy, flesh }: { uid: string; variant: number; part: number; seed: string; sx: number; sy: number; flesh: boolean }) {
  const pts = jitterPts(scalePts(SHELL, sx, sy), 1.4, `${seed}-j`);
  const shell = `${smoothClosedPath(pts)}Z`;
  const ring = `${smoothClosedPath(scalePts(pts, 0.93, 0.9, 6, 0))}Z`;
  const nacre = `${smoothClosedPath(scalePts(pts, 0.86, 0.8, 7, 0))}Z`;
  const meatPts = jitterPts(scalePts(pts, 0.72, 0.64, 9, 0), 1.6, `${seed}-m`);
  const meat = `${smoothClosedPath(meatPts)}Z`;
  const fold = smoothOpenPath(scalePts(meatPts.slice(1, 7), 0.6, 0.45, 12, 2));
  const flecks = dotsPath(scatterDots(`${seed}-fl`, 8, 13, 0.6, 1.4).map((d) => ({ ...d, x: r2(d.x * 1.7 + 10), y: d.y })));
  const gs = idFor(uid, 'coz', variant, part, 's');
  const gn = idFor(uid, 'coz', variant, part, 'n');
  const gm = idFor(uid, 'coz', variant, part, 'm');
  return (
    <>
      <defs>
        <radialGradient id={gs} cx="-14" cy="-14" r="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4d5f86" />
          <stop offset="0.5" stopColor="#222b42" />
          <stop offset="1" stopColor="#0b0e18" />
        </radialGradient>
        <linearGradient id={gn} x1="-30" y1="-22" x2="34" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#eef0f6" />
          <stop offset="0.4" stopColor="#c7cfe2" />
          <stop offset="0.7" stopColor="#b6aecb" />
          <stop offset="1" stopColor="#7f8cab" />
        </linearGradient>
        <radialGradient id={gm} cx="-4" cy="-8" r="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd99a" />
          <stop offset="0.5" stopColor="#f5a65c" />
          <stop offset="1" stopColor="#d77b36" />
        </radialGradient>
      </defs>
      <path d={shell} fill={`url(#${gs})`} />
      <path d={ring} fill="none" stroke="#5f7099" strokeOpacity="0.4" strokeWidth="1.2" />
      <path d={nacre} fill={`url(#${gn})`} />
      <path d={nacre} fill="none" stroke="#2c3550" strokeOpacity="0.55" strokeWidth="1.6" />
      {flesh ? (
        <>
          <path d={meat} fill={`url(#${gm})`} />
          <path d={meat} fill="none" stroke="#4a2814" strokeOpacity="0.55" strokeWidth="2.8" strokeDasharray="2.2 1.4" strokeLinejoin="round" />
          <path d={meat} fill="none" stroke="#9a5426" strokeOpacity="0.5" strokeWidth="1.2" />
          <path d={fold} fill="none" stroke="#c46a2c" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />
          <path d={flecks} fill="#fff1d6" fillOpacity="0.55" />
          <path d="M-10 -10C-2 -15 8 -15 16 -12" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <path d="M-22 -6C-8 -14 10 -15 26 -10" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3.2" strokeLinecap="round" />
      )}
      <path d={smoothOpenPath(pts.slice(1, 5))} fill="none" stroke="#9fb0d6" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" />
      <Sparkle x={pts[2]!.x + 2} y={pts[2]!.y + 2.5} r={1.5} o={0.7} />
    </>
  );
}

function Cozze({ variant, uid }: PieceProps) {
  const seed = `cozze-${variant}`;
  if (variant === 3) {
    // Butterflied: both halves still joined at the hinge, one empty, one with the mussel.
    return (
      <>
        <g fill="#0a0604" fillOpacity="0.3">
          <path d={`${smoothClosedPath(SHELL)}Z`} transform="translate(-18.5 -5.5) rotate(-28) scale(0.56 0.62) translate(46 0)" />
          <path d={`${smoothClosedPath(SHELL)}Z`} transform="translate(-18.5 -5.5) rotate(28) scale(0.6 0.66) translate(46 0)" />
        </g>
        <g transform="translate(-21 -9) rotate(-28) scale(0.56 0.62) translate(46 0)">
          <MusselHalf uid={uid} variant={variant} part={0} seed={`${seed}-a`} sx={1} sy={1} flesh={false} />
        </g>
        <g transform="translate(-21 -9) rotate(28) scale(0.6 0.66) translate(46 0)">
          <MusselHalf uid={uid} variant={variant} part={1} seed={`${seed}-b`} sx={1} sy={1} flesh />
        </g>
      </>
    );
  }
  const sx = [1, 0.94, 1][variant] ?? 1;
  const sy = [1, 1.12, 0.9][variant] ?? 1;
  return (
    <g transform={variant === 2 ? 'rotate(-8)' : ''}>
      <g transform="translate(2.6 3.6)" fill="#0a0604">
        <path d={`${smoothClosedPath(scalePts(SHELL, sx * 1.04, sy * 1.06))}Z`} fillOpacity="0.16" />
        <path d={`${smoothClosedPath(scalePts(SHELL, sx, sy))}Z`} fillOpacity="0.3" />
      </g>
      <MusselHalf uid={uid} variant={variant} part={0} seed={seed} sx={sx} sy={sy} flesh />
    </g>
  );
}

// ── Salmone affumicato: a thin, glossy, folded ribbon (after bake, fresh) ────────
const SALMON = [
  { amp: 8, k: 0.9, w: 17, fold: 0.38 },
  { amp: 12, k: 0.6, w: 15, fold: 0.62 },
  { amp: 5, k: 1.2, w: 18, fold: 0.5 },
  { amp: 14, k: 0.45, w: 16, fold: 0.3 },
];

function Salmone({ variant, uid }: PieceProps) {
  const s = SALMON[variant] ?? SALMON[0]!;
  const rng = createRng(`salmone-${variant}-edge`);
  const wob = Array.from({ length: 15 }, () => rng.range(-0.12, 0.12));
  const center: Pt[] = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    return { x: r2(-43 + 86 * t), y: r2(s.amp * Math.sin((t * 2 - 1) * Math.PI * s.k)) };
  });
  const half = (t: number) => s.w * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * t), 0.6)) * (1 + wob[Math.round(t * 14)]!);
  const outline = `${smoothClosedPath(ribbonOutline(center, half))}Z`;
  const halo = `${smoothClosedPath(ribbonOutline(center, (t) => half(t) + 2.2))}Z`;
  // Soft white fat lines in a gentle chevron, irregularly spaced and clipped to the slice.
  let fat = '';
  let x = -52;
  while (x < 52) {
    const bend = rng.range(5, 10);
    fat += `M${r2(x - 6)} -34Q${r2(x + bend)} ${r2(rng.range(-6, 6))} ${r2(x - 4)} 34`;
    x += rng.range(8, 13);
  }
  const foldIdx = Math.round(s.fold * 14);
  const fa = offsetLine(center, (t) => -half(t) * 1.1);
  const fb = offsetLine(center, (t) => half(t) * 1.1);
  const crease = `M${fa[foldIdx]!.x} ${fa[foldIdx]!.y}L${fb[foldIdx]!.x + 3} ${fb[foldIdx]!.y}`;
  const creaseLight = `M${fa[foldIdx]!.x + 4} ${fa[foldIdx]!.y}L${fb[foldIdx]!.x + 7} ${fb[foldIdx]!.y}`;
  const gloss = smoothOpenPath(offsetLine(center, (t) => -half(t) * 0.55, 0.1, 0.5));
  const gloss2 = smoothOpenPath(offsetLine(center, (t) => -half(t) * 0.4, 0.62, 0.88));
  const g = idFor(uid, 'slm', variant);
  const clip = idFor(uid, 'slm', variant, 'c');
  return (
    <>
      <g transform="translate(2 3)" fill="#2a0c04">
        <path d={outline} fillOpacity="0.22" />
      </g>
      <defs>
        <linearGradient id={g} x1="-40" y1="-20" x2="40" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffa577" />
          <stop offset="0.45" stopColor="#f6804f" />
          <stop offset="1" stopColor="#de5d33" />
        </linearGradient>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>
      <path d={halo} fill="#ffb08a" fillOpacity="0.35" />
      <path d={outline} fill={`url(#${g})`} />
      <g clipPath={`url(#${clip})`}>
        <path d={fat} fill="none" stroke="#ffe6d6" strokeOpacity="0.22" strokeWidth="3.6" strokeLinecap="round" />
        <path d={fat} fill="none" stroke="#fff6ef" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
        <path d={crease} fill="none" stroke="#b9422a" strokeOpacity="0.38" strokeWidth="6" strokeLinecap="round" />
        <path d={creaseLight} fill="none" stroke="#ffd2b8" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d={outline} fill="none" stroke="#ffc6a8" strokeOpacity="0.7" strokeWidth="1.8" strokeLinejoin="round" />
      <path d={gloss} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <path d={gloss2} fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="2" strokeLinecap="round" />
      <Sparkle x={center[3]!.x} y={r2(center[3]!.y - half(3 / 14) * 0.5)} r={1.6} o={0.7} />
    </>
  );
}

export const fishArt: IngredientArt[] = [
  { slug: 'acciughe', sizeCm: 5, density: 7, scatter: 'discrete', layer: 50, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Acciughe },
  { slug: 'tonno', sizeCm: 3, density: 10, scatter: 'discrete', layer: 50, variants: 4, rotation: 'free', scaleJitter: 0.14, Piece: Tonno },
  { slug: 'gamberetti', sizeCm: 4.5, density: 7, scatter: 'discrete', layer: 50, variants: 4, rotation: 'free', scaleJitter: 0.1, Piece: Gamberetti },
  { slug: 'cozze', sizeCm: 4, density: 7, scatter: 'discrete', layer: 50, variants: 4, rotation: 'free', scaleJitter: 0.1, Piece: Cozze },
  { slug: 'salmone', sizeCm: 6, density: 6, scatter: 'discrete', layer: 50, variants: 4, rotation: 'free', scaleJitter: 0.12, Piece: Salmone },
];
