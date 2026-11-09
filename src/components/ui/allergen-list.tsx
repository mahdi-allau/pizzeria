import type { AllergenCode } from '@/domain/allergens';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * Allergens as plain, readable text chips (Reg. UE 1169/2011): never colour alone, never an icon alone.
 * `tone="paper"` is for cream surfaces (menu, receipt), `tone="dark"` for the dark stage.
 */
export function AllergenList({
  codes,
  tone = 'dark',
  label = true,
  className,
}: {
  codes: readonly AllergenCode[];
  tone?: 'dark' | 'paper';
  label?: boolean;
  className?: string;
}) {
  if (codes.length === 0) {
    return <p className={cn('text-sm', tone === 'paper' ? 'text-charcoal-600' : 'text-cream-400', className)}>{t.allergenNotice.none}</p>;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {label && <span className={cn('text-sm font-semibold', tone === 'paper' ? 'text-charcoal-900' : 'text-cream-100')}>{t.allergenNotice.contains}:</span>}
      <ul className="contents">
        {codes.map((code) => (
          <li
            key={code}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium',
              tone === 'paper' ? 'bg-charcoal-900/8 text-charcoal-800 ring-1 ring-charcoal-900/20' : 'bg-cream-100/8 text-cream-100 ring-1 ring-cream-100/25',
            )}
          >
            {t.allergens[code]}
          </li>
        ))}
      </ul>
    </div>
  );
}
