import Image from 'next/image';
import { business } from '@/config/business';
import { cn } from '@/lib/cn';

/** Logo mark + name. The name is set in Bodoni italic; replace public/brand/logo.svg with the real logo. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image src={business.brand.logo} alt="" width={34} height={34} priority className="size-[34px]" />
      <span className="display text-[1.45rem] italic leading-none">{business.shortName}</span>
    </span>
  );
}
