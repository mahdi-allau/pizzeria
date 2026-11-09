import { buildMelt } from '../melt-art';
import { dotsPath, type Dot } from '../art/shapes';
import type { Ellipse } from '../base-art';

/** The melted mozzarella, as the content of a <g> centred on the pizza. References gradients/clip defined by PizzaBase. */
export function CheeseMeltContent({ uid, seed, portions, sauceRadius }: { uid: string; seed: string; portions: number; sauceRadius: number }) {
  const art = buildMelt(seed, portions, sauceRadius);
  const ellipse = (e: Ellipse) => `translate(${e.cx} ${e.cy}) rotate(${e.rot})`;
  return (
    <g clipPath={`url(#${uid}-sauce-clip)`}>
      <path d={art.base} transform="translate(3 6)" fill="#5a1208" fillOpacity="0.3" fillRule="evenodd" />
      <path d={art.base} fill={`url(#${uid}-cheese)`} fillRule="evenodd" />
      <path d={art.base} fill="none" stroke="#b98a42" strokeOpacity="0.75" strokeWidth="3.2" />
      <path d={art.highlight} fill="#fff7de" fillOpacity="0.6" fillRule="evenodd" />
      <path d={art.highlight} fill="none" stroke="#e6c98a" strokeOpacity="0.5" strokeWidth="1.6" />
      {art.browning.map((b: Dot, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={`url(#${uid}-brown)`} />
      ))}
      {art.sheen.map((e, i) => (
        <ellipse key={i} transform={ellipse(e)} rx={e.rx} ry={e.ry} fill="#fff" fillOpacity="0.4" />
      ))}
      <path d={dotsPath(art.bubbles)} fill="none" stroke="#d9b974" strokeOpacity="0.55" strokeWidth="1.4" />
    </g>
  );
}

/** Static (non-animated) cheese layer: its own SVG stacked between the base and the toppings. */
export function CheeseMelt(props: { uid: string; seed: string; portions: number; sauceRadius: number }) {
  return (
    <svg viewBox="0 0 1000 1000" className="absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <g transform="translate(500 500)">
        <CheeseMeltContent {...props} />
      </g>
    </svg>
  );
}
