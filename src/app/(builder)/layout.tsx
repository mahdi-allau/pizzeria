import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/header';

/** The builder fills the screen below a slim header: no footer, so the pizza and its controls own the viewport. */
export default function BuilderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="contenuto" className="min-h-0">
        {children}
      </main>
    </>
  );
}
