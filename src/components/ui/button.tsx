import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

/**
 * Buttons press like enamel signs: a hard bottom edge that compresses on press (CSS only, no JS).
 * `asChild` renders the styles on your own element, e.g. a Next <Link>.
 */

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-sign font-semibold ' +
  'transition-[transform,box-shadow,background-color,color,border-color] duration-100 ease-out ' +
  'active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

export const buttonVariants = {
  primary:
    'bg-tomato-600 text-cream-50 shadow-[0_3px_0_0_var(--color-tomato-700)] hover:bg-tomato-500 active:shadow-[0_1px_0_0_var(--color-tomato-700)]',
  basil:
    'bg-basil-600 text-cream-50 shadow-[0_3px_0_0_var(--color-basil-700)] hover:bg-basil-500 active:shadow-[0_1px_0_0_var(--color-basil-700)]',
  /** Outline for dark surfaces. */
  secondary: 'border border-cream-400/45 text-cream-100 hover:bg-cream-100/8 hover:border-cream-300/70 active:bg-cream-100/12',
  /** Solid ink button for paper surfaces. */
  ink: 'bg-charcoal-900 text-cream-50 shadow-[0_3px_0_0_var(--color-charcoal-950)] hover:bg-charcoal-700 active:shadow-[0_1px_0_0_var(--color-charcoal-950)]',
  ghost: 'text-cream-100 hover:bg-cream-100/10 active:bg-cream-100/15',
} as const;

export const buttonSizes = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-14 px-7 text-base',
  icon: 'h-11 w-11',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  asChild?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'primary', size = 'md', asChild = false, loading = false, className, children, disabled, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(base, buttonVariants[variant], buttonSizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner />}
          {children}
        </>
      )}
    </Comp>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
