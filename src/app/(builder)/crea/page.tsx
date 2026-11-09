import type { Metadata } from 'next';
import { io } from 'next/cache';
import { Suspense } from 'react';
import { getDb } from '@/db/client';
import { BuilderClient, BuilderSkeleton } from '@/features/builder/builder-client';
import { resolveInit } from '@/features/builder/init';
import { loadCatalog } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'Crea la tua pizza',
  description: 'Scegli dimensione, impasto e salsa, poi aggiungi gli ingredienti uno alla volta e guarda la pizza prendere forma.',
};

export default function Page(props: PageProps<'/crea'>) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <Builder searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Builder({ searchParams }: { searchParams: PageProps<'/crea'>['searchParams'] }) {
  const params = await searchParams;
  await io(); // a random seed per visit: keep it out of the static shell
  const seed = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const catalog = await loadCatalog(await getDb());
  return <BuilderClient catalog={catalog} init={resolveInit(catalog, params, seed)} />;
}
