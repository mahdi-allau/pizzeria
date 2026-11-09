'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * A dialog that is a bottom sheet on phones and a centred card from `md` up. Radix handles focus trapping, Escape,
 * scroll locking and screen-reader semantics; we only style it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  tone = 'dark',
  hideTitle = false,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'dark' | 'paper';
  hideTitle?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-charcoal-950/75 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-[71] flex max-h-[88dvh] flex-col outline-none',
            'inset-x-0 bottom-0 rounded-t-[1.75rem] data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
            'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(30rem,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:data-[state=closed]:animate-fade-out md:data-[state=open]:animate-pop-in',
            tone === 'paper' ? 'paper' : 'bg-charcoal-800 text-cream-100 shadow-[0_-16px_60px_rgba(0,0,0,0.6)] md:shadow-[0_24px_80px_rgba(0,0,0,0.65)]',
            className,
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-current opacity-25 md:hidden" aria-hidden="true" />
          <div className={cn('flex items-start justify-between gap-4 px-5 pb-2 pt-4', hideTitle && 'sr-only')}>
            <div>
              <Dialog.Title className="display text-[1.7rem]">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm opacity-75">{description}</Dialog.Description>}
            </div>
          </div>
          {!hideTitle && (
            <Dialog.Close
              aria-label={t.common.close}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full opacity-70 hover:bg-current/10 hover:opacity-100"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          )}
          {hideTitle && description === undefined && <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
