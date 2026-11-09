'use client';

import { m } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { cartCount, useCartStore } from '@/features/cart/store';
import { t } from '@/i18n';

/** The cart link with a live count. Renders 0 on the server and fills in once the browser has read the cart. */
export function CartButton() {
  const count = useCartStore((s) => cartCount(s.lines));
  return (
    <Link
      href="/carrello"
      aria-label={`Carrello, ${t.plural.items(count)}`}
      className="relative grid size-11 place-items-center rounded-full text-cream-100 transition-colors hover:bg-cream-100/10 active:scale-95"
    >
      <ShoppingBag className="size-[1.4rem]" aria-hidden="true" />
      {count > 0 && (
        <m.span
          key={count}
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 16 }}
          className="figures absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-tomato-600 px-1 text-[0.72rem] font-bold leading-5 text-cream-50"
        >
          {count}
        </m.span>
      )}
    </Link>
  );
}
