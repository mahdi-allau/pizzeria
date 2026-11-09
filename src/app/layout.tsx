import type { Metadata, Viewport } from 'next';
import { MotionProvider } from '@/components/motion-provider';
import { Toaster } from '@/components/toast';
import { CartHydrator } from '@/features/cart/cart-hydrator';
import { brandCssVariables, business } from '@/config/business';
import { appUrl } from '@/env';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { displayFont, sansFont } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: `${business.name}: pizza d’asporto`, template: `%s | ${business.name}` },
  description: business.description,
  applicationName: business.name,
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: business.name,
    title: `${business.name}: pizza d’asporto`,
    description: business.description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: business.brand.colors.charcoal[900],
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="it" className={cn(displayFont.variable, sansFont.variable)}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body>
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sign focus:bg-cream-100 focus:px-4 focus:py-2 focus:font-semibold focus:text-charcoal-900"
        >
          {t.common.skipToContent}
        </a>
        <MotionProvider>
          {children}
          <CartHydrator />
          <Toaster />
        </MotionProvider>
      </body>
    </html>
  );
}
