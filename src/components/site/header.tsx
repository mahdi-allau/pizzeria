import Link from 'next/link';
import { business } from '@/config/business';
import { CartButton } from './cart-button';
import { NavLinks } from './nav-links';
import { Wordmark } from './wordmark';

/** Slim sticky header (3.5rem: the builder sizes itself against this). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-charcoal-600/70 bg-charcoal-900/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={`${business.name}, home`} className="rounded-sign">
          <Wordmark />
        </Link>
        <NavLinks className="hidden md:flex" />
        <CartButton />
      </div>
    </header>
  );
}
