import { Bodoni_Moda, Instrument_Sans } from 'next/font/google';

/**
 * Typography. Change the families here to re-type the whole site (next/font needs static imports).
 *  - Display: Bodoni Moda — Giambattista Bodoni worked in Parma; high-contrast, elegant, used large only.
 *  - Body: Instrument Sans — clean and legible down to small sizes.
 */
export const displayFont = Bodoni_Moda({
  subsets: ['latin'],
  variable: '--font-bodoni',
  axes: ['opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const sansFont = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});
