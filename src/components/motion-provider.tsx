'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * App-wide motion setup. Components use the lightweight `m.*` elements; the animation features load once here.
 * `reducedMotion="user"` makes every transform/layout animation respect the OS "reduce motion" setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
