import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** A quiet placeholder block. Size it to match the content that will replace it, so nothing shifts when it loads. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-charcoal-700/70 motion-reduce:animate-none', className)} {...props} />;
}
