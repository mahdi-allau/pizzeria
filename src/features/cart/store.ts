'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartLineInput, PizzaConfig } from '@/domain/cart';
import { LIMITS } from '@/domain/limits';

/**
 * The shopping cart, kept in the browser (localStorage) and sent to the server only at checkout, where every price
 * is recomputed from the database. Lines carry NO prices: they describe what was chosen, nothing more.
 */

export type CartLine = { id: string; quantity: number; notes?: string } & (
  | { type: 'pizza'; pizza: PizzaConfig }
  | { type: 'product'; slug: string }
);

interface CartState {
  lines: CartLine[];
  /** false until localStorage has been read (the server render always starts empty). */
  hydrated: boolean;
  addPizza: (pizza: PizzaConfig, quantity?: number) => string;
  addProduct: (slug: string, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  setNotes: (id: string, notes: string) => void;
  replacePizza: (id: string, pizza: PizzaConfig) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** localStorage that never throws (private mode, blocked storage, quota). */
const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* the cart still works for this session */
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const clamp = (n: number) => Math.max(1, Math.min(LIMITS.maxQuantityPerLine, Math.floor(n)));

/** Two pizzas are "the same order line" when everything the kitchen sees is the same. */
function samePizza(a: PizzaConfig, b: PizzaConfig): boolean {
  if (a.menuSlug !== b.menuSlug || a.size !== b.size || a.dough !== b.dough || a.sauce !== b.sauce) return false;
  if (a.ingredients.length !== b.ingredients.length) return false;
  const key = (p: PizzaConfig) =>
    [...p.ingredients]
      .sort((x, y) => x.slug.localeCompare(y.slug))
      .map((i) => `${i.slug}:${i.portions}`)
      .join('|');
  return key(a) === key(b);
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      hydrated: false,

      addPizza: (pizza, quantity = 1) => {
        const existing = get().lines.find((l) => l.type === 'pizza' && !l.notes && samePizza(l.pizza, pizza));
        if (existing) {
          set((s) => ({ lines: s.lines.map((l) => (l.id === existing.id ? { ...l, quantity: clamp(l.quantity + quantity) } : l)) }));
          return existing.id;
        }
        const id = newId();
        set((s) => ({ lines: [...s.lines, { id, type: 'pizza', pizza, quantity: clamp(quantity) }] }));
        return id;
      },

      addProduct: (slug, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.type === 'product' && l.slug === slug);
          if (existing) return { lines: s.lines.map((l) => (l.id === existing.id ? { ...l, quantity: clamp(l.quantity + quantity) } : l)) };
          return { lines: [...s.lines, { id: newId(), type: 'product', slug, quantity: clamp(quantity) }] };
        }),

      setQuantity: (id, quantity) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, quantity: clamp(quantity) } : l)) })),

      setNotes: (id, notes) =>
        set((s) => ({
          lines: s.lines.map((l) => {
            if (l.id !== id) return l;
            const trimmed = notes.slice(0, LIMITS.maxNoteLength);
            if (trimmed.trim() === '') {
              const { notes: _dropped, ...rest } = l;
              return rest as CartLine;
            }
            return { ...l, notes: trimmed };
          }),
        })),

      replacePizza: (id, pizza) => set((s) => ({ lines: s.lines.map((l) => (l.id === id && l.type === 'pizza' ? { ...l, pizza } : l)) })),

      duplicate: (id) =>
        set((s) => {
          const source = s.lines.find((l) => l.id === id);
          if (!source) return s;
          const copy: CartLine = source.type === 'pizza' ? { ...source, id: newId(), pizza: { ...source.pizza, seed: undefined } } : { ...source, id: newId() };
          const index = s.lines.findIndex((l) => l.id === id);
          return { lines: [...s.lines.slice(0, index + 1), copy, ...s.lines.slice(index + 1)] };
        }),

      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'pizzeria.cart.v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ lines: s.lines }),
      skipHydration: true,
      onRehydrateStorage: () => () => useCartStore.setState({ hydrated: true }),
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

/** The wire format sent to /api/checkout (no ids, no prices). */
export function toCartInput(lines: CartLine[]): CartLineInput[] {
  return lines.map((l) =>
    l.type === 'pizza'
      ? { type: 'pizza', pizza: l.pizza, quantity: l.quantity, ...(l.notes ? { notes: l.notes } : {}) }
      : { type: 'product', slug: l.slug, quantity: l.quantity, ...(l.notes ? { notes: l.notes } : {}) },
  );
}
