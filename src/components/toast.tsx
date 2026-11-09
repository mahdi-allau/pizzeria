'use client';

import { AnimatePresence, m } from 'framer-motion';
import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'info';
}

const useToasts = create<{ toasts: Toast[]; push: (message: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (message, tone = 'success') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget: `toast('Aggiunto al carrello')`. The message is also announced to screen readers. */
export const toast = (message: string, tone: Toast['tone'] = 'success') => useToasts.getState().push(message, tone);

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="pointer-events-auto rounded-sign bg-cream-100 px-4 py-2.5 text-sm font-semibold text-charcoal-900 shadow-[0_6px_24px_rgba(0,0,0,0.45)]"
          >
            {t.message}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
