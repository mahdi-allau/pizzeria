'use client';

import { animate, m, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatEUR } from '@/domain/money';
import { cn } from '@/lib/cn';

/** A price in cents, in lining tabular figures. Server-safe formatting. */
export function Price({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn('figures whitespace-nowrap', className)}>{formatEUR(cents)}</span>;
}

/** A price that counts up or down to its new value (instantly with reduced motion). */
export function AnimatedPrice({ cents, className }: { cents: number; className?: string }) {
  const reduce = useReducedMotion();
  const value = useMotionValue(cents);
  const text = useTransform(value, (v) => formatEUR(Math.max(0, Math.round(v))));
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) {
      value.set(cents);
      first.current = false;
      return;
    }
    const controls = animate(value, cents, { type: 'spring', stiffness: 170, damping: 22, mass: 0.7 });
    return () => controls.stop();
  }, [cents, reduce, value]);

  return (
    <m.span className={cn('figures whitespace-nowrap', className)} aria-label={formatEUR(cents)}>
      {text}
    </m.span>
  );
}
