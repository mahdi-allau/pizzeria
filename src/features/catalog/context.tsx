'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Catalog } from '@/domain/catalog';

const CatalogContext = createContext<Catalog | null>(null);

/** Hands the (server-loaded) catalog to client components, so the browser can show live prices with the same pricing code. */
export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <CatalogContext value={catalog}>{children}</CatalogContext>;
}

export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return catalog;
}
