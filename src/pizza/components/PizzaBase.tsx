import { PIZZA_RADIUS, BOARD_RADIUS, doughLook } from '../geometry';
import { buildBaseArt, type Ellipse } from '../base-art';
import { polar, type Dot } from '../art/shapes';

/**
 * The static layer of the pizza: wooden board, crust, dough, sauce and (optionally) the melted mozzarella.
 * Drawn once as one SVG that never animates, so the browser can rasterise it a single time while toppings fly over it.
 * Server-safe: no hooks, no browser APIs.
 */

interface Props {
  /** Unique per canvas on the page: namespaces gradient and clip ids. */
  uid: string;
  dough: string;
  sauce: string;
  seed: string;
}

const ellipse = (e: Ellipse) => `translate(${e.cx} ${e.cy}) rotate(${e.rot})`;
/** "x y" of a point on a circle of radius r at `deg` degrees (rounded: see r2). */
const spec = (deg: number, r: number) => {
  const p = polar((deg * Math.PI) / 180, r);
  return `${p.x} ${p.y}`;
};
const circle = (d: Dot, key: number, extra: Record<string, string | number>) => <circle key={key} cx={d.x} cy={d.y} r={d.r} {...extra} />;

export function PizzaBase({ uid, dough, sauce, seed }: Props) {
  const look = doughLook(dough);
  const art = buildBaseArt(seed, dough, sauce);
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const R = PIZZA_RADIUS;
  const innerRatio = art.innerR / R;
  const s = art.sauce;

  return (
    <svg viewBox="0 0 1000 1000" className="absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id('board')} cx="0" cy="-40" r="500" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#54392b" />
          <stop offset="0.65" stopColor="#3c2a1f" />
          <stop offset="1" stopColor="#22160f" />
        </radialGradient>
        <radialGradient id={id('shadow')}>
          <stop offset="0.78" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('crust')} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
          <stop offset={innerRatio} stopColor={look.crust.light} />
          <stop offset={0.93} stopColor={look.crust.mid} />
          <stop offset="1" stopColor={look.crust.dark} />
        </radialGradient>
        <linearGradient id={id('crust-lit')} x1="-300" y1="-320" x2="300" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id={id('crust-ridge')} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
          <stop offset={innerRatio - 0.002} stopColor="#2a1005" stopOpacity="0.32" />
          <stop offset={innerRatio + 0.04} stopColor="#2a1005" stopOpacity="0" />
          <stop offset="0.925" stopColor="#ffe9b8" stopOpacity="0.28" />
          <stop offset="0.962" stopColor="#ffe9b8" stopOpacity="0" />
          <stop offset="1" stopColor="#1f0c03" stopOpacity="0.38" />
        </radialGradient>
        <radialGradient id={id('bubble')}>
          <stop offset="0" stopColor="#fff0c4" stopOpacity="0.7" />
          <stop offset="0.6" stopColor="#ebbe6e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#965a1e" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={id('dough')} cx="-60" cy="-80" r={art.innerR + 10} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={look.base.light} />
          <stop offset="1" stopColor={look.base.dark} />
        </radialGradient>
        <radialGradient id={id('sauce')} cx="-70" cy="-90" r={art.sauceR + 20} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ee5a38" />
          <stop offset="0.5" stopColor="#d9432b" />
          <stop offset="0.85" stopColor="#bb311d" />
          <stop offset="1" stopColor="#98261a" />
        </radialGradient>
        <radialGradient id={id('oil')} cx="-60" cy="-80" r={art.sauceR + 20} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f8ebc6" />
          <stop offset="0.6" stopColor="#efd59f" />
          <stop offset="1" stopColor="#e0b972" />
        </radialGradient>
        <radialGradient id={id('cheese')} cx="-110" cy="-130" r="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fcf2d3" />
          <stop offset="0.55" stopColor="#f4e3b6" />
          <stop offset="1" stopColor="#e9d09a" />
        </radialGradient>
        <radialGradient id={id('brown')}>
          <stop offset="0" stopColor="#d58a2c" stopOpacity="0.62" />
          <stop offset="1" stopColor="#d58a2c" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('ring')}>
          <path d={art.crustRing} clipRule="evenodd" />
        </clipPath>
        <clipPath id={id('sauce-clip')}>
          <path d={s.edge} />
        </clipPath>
      </defs>

      <g transform="translate(500 500)">
        {/* Board */}
        <circle r={BOARD_RADIUS} fill={url('board')} />
        <circle r={BOARD_RADIUS - 1} fill="none" stroke="#ffe0b0" strokeOpacity="0.2" strokeWidth="2.5" />
        <circle r={BOARD_RADIUS - 16} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth="2" />
        {art.grain.map((g, i) => (
          <path key={i} d={g.d} fill="none" stroke="#9a7452" strokeOpacity={Math.min(0.4, g.o * 1.8)} strokeWidth={g.w} strokeLinecap="round" />
        ))}
        <ellipse cx="14" cy="24" rx={R + 16} ry={R + 10} fill={url('shadow')} />

        {/* Crust */}
        <path d={art.crustRing} fill={url('crust')} fillRule="evenodd" />
        <path d={art.crustRing} fill={url('crust-lit')} fillRule="evenodd" />
        <path d={art.crustRing} fill={url('crust-ridge')} fillRule="evenodd" />
        <g clipPath={`url(#${id('ring')})`}>
          {art.mottle.light.map((e, i) => (
            <ellipse key={`ml${i}`} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#ffe2a0" fillOpacity="0.15" />
          ))}
          {art.mottle.dark.map((e, i) => (
            <ellipse key={`md${i}`} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#b8651f" fillOpacity="0.17" />
          ))}
          {art.spots.map((e, i) => (
            <g key={i} transform={ellipse(e)}>
              <ellipse rx={e.rx * 1.7} ry={e.ry * 1.7} fill="#8a4a18" fillOpacity={look.spotOpacity * 0.4} />
              <ellipse rx={e.rx} ry={e.ry} fill="#3a1806" fillOpacity={look.spotOpacity} />
            </g>
          ))}
          {art.chars.map((e, i) => (
            <g key={`c${i}`} transform={ellipse(e)}>
              <ellipse rx={e.rx * 1.35} ry={e.ry * 1.5} fill="#6b3410" fillOpacity="0.35" />
              <ellipse rx={e.rx} ry={e.ry} fill="#1e0b02" fillOpacity="0.72" />
            </g>
          ))}
          {art.bubbles.map((b, i) => circle(b, i, { fill: url('bubble'), stroke: '#8a5220', strokeOpacity: 0.35, strokeWidth: 1.4 }))}
          <path d={art.flour} fill="#fff6e2" fillOpacity="0.4" />
          {art.bran && <path d={art.bran} fill="#5b3a18" fillOpacity="0.55" />}
        </g>

        {/* Light catching the top-left of the puffy crust */}
        <path d={`M${spec(200, R - 9)}A${R - 9} ${R - 9} 0 0 1 ${spec(292, R - 9)}`} fill="none" stroke="#fff3d2" strokeOpacity="0.3" strokeWidth="7" strokeLinecap="round" />
        <path d={`M${spec(212, R - 34)}A${R - 34} ${R - 34} 0 0 1 ${spec(272, R - 34)}`} fill="none" stroke="#fff3d2" strokeOpacity="0.2" strokeWidth="4" strokeLinecap="round" />

        {/* Dough under the sauce, with the crust's inner shadow */}
        <path d={art.doughDisc} fill={url('dough')} />
        <circle r={art.innerR - 2} fill="none" stroke="#5a2a0a" strokeOpacity="0.34" strokeWidth="8" />

        {/* Sauce */}
        {s.kind === 'tomato' && (
          <g>
            <path d={s.edge} fill={url('sauce')} />
            <g clipPath={`url(#${id('sauce-clip')})`}>
              {s.pools.map((e, i) => (
                <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#7e1c10" fillOpacity="0.16" />
              ))}
              {s.pulp.dark.map((e, i) => (
                <ellipse key={`pd${i}`} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#7a1a0e" fillOpacity="0.22" />
              ))}
              {s.pulp.light.map((e, i) => (
                <ellipse key={`pl${i}`} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#ff7a56" fillOpacity="0.2" />
              ))}
              <path d={s.swirlShadow} fill="none" stroke="#7e1c10" strokeOpacity="0.1" strokeWidth="8" strokeLinecap="round" />
              <path d={s.swirl} fill="none" stroke="#ff8461" strokeOpacity="0.1" strokeWidth="16" strokeLinecap="round" />
              {s.gloss.map((e, i) => (
                <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#ffe3d4" fillOpacity={i === 0 ? 0.07 : 0.05} />
              ))}
              <path d={s.droplets} fill="#ffd9a6" fillOpacity="0.38" />
              <path d={s.seeds} fill="#4f0f06" fillOpacity="0.55" />
              <path d={s.herbs} fill="#4d7a30" fillOpacity="0.7" />
              <path d={s.edge} fill="none" stroke="#8c2013" strokeOpacity="0.45" strokeWidth="16" />
            </g>
          </g>
        )}
        {s.kind === 'white' && (
          <g>
            <path d={s.edge} fill={url('oil')} />
            <g clipPath={`url(#${id('sauce-clip')})`}>
              {s.sheens.map((e, i) => (
                <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#fffdf2" fillOpacity="0.3" />
              ))}
              {s.beads.map((b, i) => circle(b, i, { fill: '#f7dc8c', fillOpacity: 0.5, stroke: '#d9a94a', strokeOpacity: 0.35, strokeWidth: 1 }))}
              {s.needles.map((n, i) => (
                <line key={i} x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke="#5a7d44" strokeOpacity="0.85" strokeWidth="2.6" strokeLinecap="round" />
              ))}
              {s.garlic.map((e, i) => (
                <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#fff3d2" stroke="#d9c088" strokeOpacity="0.7" strokeWidth="1" />
              ))}
              <path d={s.pepper} fill="#2a2724" fillOpacity="0.6" />
              <path d={s.edge} fill="none" stroke="#c99a4a" strokeOpacity="0.35" strokeWidth="14" />
            </g>
          </g>
        )}
        {s.kind === 'none' && (
          <g>
            {s.blotches.map((e, i) => (
              <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#c99a58" fillOpacity="0.12" />
            ))}
            <path d={s.flour} fill="#fff6e2" fillOpacity="0.38" />
          </g>
        )}
      </g>
    </svg>
  );
}
