'use client';

import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { Price } from '@/components/ui/price';
import type { Catalog } from '@/domain/catalog';
import { formatEUR } from '@/domain/money';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { BuilderBase } from './state';

interface Props {
  catalog: Catalog;
  base: BuilderBase;
  /** When customising a classic: its menu price per size. */
  menuPrices?: Record<string, number>;
  onChange: (field: keyof BuilderBase, value: string) => void;
}

const optionClass =
  'group relative rounded-sign border border-charcoal-500 bg-charcoal-900/50 text-left outline-offset-2 transition-colors ' +
  'hover:border-cream-400/60 data-[state=checked]:border-tomato-400 data-[state=checked]:bg-charcoal-700 ' +
  'data-[disabled]:opacity-45 data-[disabled]:pointer-events-none';

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="display text-[1.6rem]">{title}</legend>
      {hint && <p className="mt-0.5 text-sm text-cream-400">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Step 1: size, dough and sauce. The pizza on the stage changes as soon as a choice is made. */
export function StepBase({ catalog, base, menuPrices, onChange }: Props) {
  const sizes = catalog.sizes.filter((s) => s.active && (!menuPrices || menuPrices[s.slug] !== undefined));
  const doughs = catalog.doughs.filter((d) => d.active);
  const sauces = catalog.sauces.filter((s) => s.active);

  return (
    <div className="space-y-8 px-5 pb-8 pt-4">
      <Group title="Dimensione">
        <RadioGroup.Root value={base.size} onValueChange={(v) => onChange('size', v)} aria-label="Dimensione" className="mt-3 grid grid-cols-3 gap-2.5">
          {sizes.map((size) => {
            const ring = 28 + (size.diameterCm - 20) * 1.6;
            const priceCents = menuPrices ? menuPrices[size.slug]! : size.basePriceCents;
            return (
              <RadioGroup.Item key={size.slug} value={size.slug} className={cn(optionClass, 'flex flex-col items-center px-2 py-3 text-center')}>
                <span className="grid h-14 place-items-center">
                  <span className="rounded-full border-2 border-current opacity-80 transition-[width,height] group-data-[state=checked]:border-tomato-400" style={{ width: ring, height: ring }} />
                </span>
                <span className="mt-1 font-semibold">{size.name}</span>
                <span className="figures text-xs text-cream-400">{size.diameterCm} cm</span>
                <span className="mt-1 text-sm text-cream-200">
                  {menuPrices ? '' : `${t.common.from} `}
                  <Price cents={priceCents} />
                </span>
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
      </Group>

      <Group title="Impasto">
        <RadioGroup.Root value={base.dough} onValueChange={(v) => onChange('dough', v)} aria-label="Impasto" className="mt-3 grid gap-2">
          {doughs.map((dough) => (
            <RadioGroup.Item key={dough.slug} value={dough.slug} disabled={!dough.available} className={cn(optionClass, 'flex items-center gap-3 px-4 py-3')}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {dough.name} {!dough.available && <span className="text-sm font-normal text-tomato-400">({t.common.soldOut})</span>}
                </span>
                <span className="block text-sm text-cream-400">{dough.description}</span>
                {dough.allergens.length === 0 && <span className="mt-0.5 block text-sm font-medium text-basil-400">Senza glutine</span>}
              </span>
              <span className="figures shrink-0 text-sm text-cream-200">{dough.surchargeCents > 0 ? `+ ${formatEUR(dough.surchargeCents)}` : 'Incluso'}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </Group>

      <Group title="Salsa" hint="Mozzarella e tutti gli altri ingredienti li scegli al prossimo passo.">
        <RadioGroup.Root value={base.sauce} onValueChange={(v) => onChange('sauce', v)} aria-label="Salsa" className="mt-3 grid gap-2">
          {sauces.map((sauce) => (
            <RadioGroup.Item key={sauce.slug} value={sauce.slug} disabled={!sauce.available} className={cn(optionClass, 'flex items-center gap-3 px-4 py-3')}>
              <span
                aria-hidden="true"
                className="size-7 shrink-0 rounded-full ring-1 ring-cream-100/30"
                style={{
                  background:
                    sauce.slug === 'rossa'
                      ? 'radial-gradient(circle at 35% 30%, #ee5a38, #b8301d)'
                      : sauce.slug === 'bianca'
                        ? 'radial-gradient(circle at 35% 30%, #f8ebc6, #e0b972)'
                        : 'radial-gradient(circle at 35% 30%, #efd29b, #e0b878)',
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{sauce.name}</span>
                <span className="block text-sm text-cream-400">{sauce.description}</span>
              </span>
              <span className="figures shrink-0 text-sm text-cream-200">{sauce.surchargeCents > 0 ? `+ ${formatEUR(sauce.surchargeCents)}` : 'Incluso'}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </Group>
    </div>
  );
}
