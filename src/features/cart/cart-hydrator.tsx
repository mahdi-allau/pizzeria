'use client';

import { useEffect } from 'react';
import { useCartStore } from './store';

/** Reads the cart from localStorage once the page is interactive (the server render never has it). */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
    // Keep several tabs in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pizzeria.cart.v1') void useCartStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return null;
}
