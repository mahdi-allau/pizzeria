'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/menu', label: 'Menu' },
  { href: '/crea', label: 'Crea la tua pizza' },
] as const;

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principale" className={cn('items-center gap-1', className)}>
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative rounded-sign px-3.5 py-2 text-[0.95rem] font-semibold transition-colors hover:text-cream-50',
              'after:absolute after:inset-x-3.5 after:bottom-1 after:h-0.5 after:rounded-full after:bg-tomato-500 after:transition-opacity',
              active ? 'text-cream-50 after:opacity-100' : 'text-cream-300 after:opacity-0',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
