import type { IngredientCategory } from '@/domain/catalog';
import { getArt } from '@/pizza/art/registry';
import { blobPath } from '@/pizza/art/shapes';

/**
 * A small preview of an ingredient for the picker: the real art piece on a plate. Mozzarella (a melted layer) and
 * olive oil (a drizzle) have no single piece, so they get hand-made previews.
 */
export function IngredientPlate({ slug, category, className }: { slug: string; category?: IngredientCategory; className?: string }) {
  const art = getArt(slug, category);
  const uid = `plate-${slug}`;

  if (art.scatter === 'melt') {
    return (
      <svg viewBox="-56 -56 112 112" className={className} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${uid}-g`} cx="-14" cy="-16" r="70" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffaea" />
            <stop offset="0.6" stopColor="#f4e3b6" />
            <stop offset="1" stopColor="#e3c88a" />
          </radialGradient>
          <radialGradient id={`${uid}-b`}>
            <stop offset="0" stopColor="#d58a2c" stopOpacity="0.6" />
            <stop offset="1" stopColor="#d58a2c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={blobPath(38, 0.16, 'plate-mozzarella', 12)} transform="translate(2 3)" fill="#1a0a04" fillOpacity="0.28" />
        <path d={blobPath(38, 0.16, 'plate-mozzarella', 12)} fill={`url(#${uid}-g)`} stroke="#b98a42" strokeOpacity="0.7" strokeWidth="2" />
        <circle cx="12" cy="8" r="9" fill={`url(#${uid}-b)`} />
        <circle cx="-14" cy="-12" r="6" fill={`url(#${uid}-b)`} />
        <ellipse cx="-12" cy="-16" rx="14" ry="6" transform="rotate(-30 -12 -16)" fill="#fff" fillOpacity="0.45" />
      </svg>
    );
  }

  if (art.scatter === 'drizzle') {
    return (
      <svg viewBox="-56 -56 112 112" className={className} aria-hidden="true" focusable="false">
        <path d="M-42 -18C-26 -40 -10 6 6 -14S36 -34 44 -6" fill="none" stroke="#c9a02c" strokeOpacity="0.55" strokeWidth="11" strokeLinecap="round" />
        <path d="M-42 -18C-26 -40 -10 6 6 -14S36 -34 44 -6" fill="none" stroke="#e6c64e" strokeWidth="6" strokeLinecap="round" />
        <path d="M-40 14C-22 -4 -6 36 14 18S38 8 44 22" fill="none" stroke="#c9a02c" strokeOpacity="0.55" strokeWidth="11" strokeLinecap="round" />
        <path d="M-40 14C-22 -4 -6 36 14 18S38 8 44 22" fill="none" stroke="#e6c64e" strokeWidth="6" strokeLinecap="round" />
        <path d="M-34 -30L-24 -34M-12 10L-4 8M18 18L26 14" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const Piece = art.Piece;
  if (art.scatter === 'sprinkle') {
    // A single speck is invisible at plate size: show a small heap of them.
    return (
      <svg viewBox="-56 -56 112 112" className={className} aria-hidden="true" focusable="false">
        {[
          [-22, -16, 0],
          [18, -20, 1],
          [-8, 12, 2],
          [26, 14, 0],
          [-30, 22, 1],
        ].map(([x, y, v], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(0.95)`}>
            <Piece variant={(v ?? 0) % art.variants} uid={`${uid}-${i}`} />
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="-56 -56 112 112" className={className} aria-hidden="true" focusable="false">
      <Piece variant={0} uid={uid} />
    </svg>
  );
}
