import { eq } from 'drizzle-orm';
import { business } from '@/config/business';
import type { Db } from '@/db/client';
import { defaultSettingsValues } from '@/db/defaults';
import { settings } from '@/db/schema';
import type { SlotRules, WeeklyHours } from '@/domain/slots';

export interface AppSettings {
  hours: WeeklyHours;
  prepMinutes: number;
  slotMinutes: number;
  /** Max pizzas per slot. */
  slotCapacity: number;
  maxDaysAhead: number;
  /** false = temporarily closed. */
  shopOpen: boolean;
  closedMessage: string | null;
  reopenAt: Date | null;
  closedDates: string[];
  notificationEmail: string | null;
}

/** Loads the single settings row, recreating it from the business defaults if it is missing. */
export async function loadSettings(db: Db): Promise<AppSettings> {
  let [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) {
    await db.insert(settings).values(defaultSettingsValues()).onConflictDoNothing();
    [row] = await db.select().from(settings).where(eq(settings.id, 1));
  }
  const r = row!;
  return {
    hours: r.hours,
    prepMinutes: r.prepMinutes,
    slotMinutes: r.slotMinutes,
    slotCapacity: r.slotCapacity,
    maxDaysAhead: r.maxDaysAhead,
    shopOpen: r.shopOpen,
    closedMessage: r.closedMessage,
    reopenAt: r.reopenAt,
    closedDates: r.closedDates,
    notificationEmail: r.notificationEmail,
  };
}

export function toSlotRules(s: AppSettings, timezone: string = business.timezone): SlotRules {
  return {
    timezone,
    slotMinutes: s.slotMinutes,
    prepMinutes: s.prepMinutes,
    capacity: s.slotCapacity,
    maxDaysAhead: s.maxDaysAhead,
    hours: s.hours,
    closedDates: s.closedDates,
    shopOpen: s.shopOpen,
    reopenAt: s.reopenAt,
  };
}
