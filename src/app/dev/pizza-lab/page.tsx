import { notFound } from 'next/navigation';
import { devFeaturesEnabled } from '@/env';
import { PizzaLab } from './pizza-lab';

export const metadata = { title: 'Pizza lab', robots: { index: false, follow: false } };

/** Development-only workbench for the pizza art. 404s whenever dev features are off (always, in production). */
export default function Page() {
  if (!devFeaturesEnabled()) notFound();
  return <PizzaLab />;
}
