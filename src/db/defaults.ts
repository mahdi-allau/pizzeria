import { business } from '../config/business';
import type { settings } from './schema';

/** Initial values of the single settings row, taken from the rebrand config. */
export function defaultSettingsValues(): typeof settings.$inferInsert {
  const d = business.defaults;
  return {
    id: 1,
    hours: structuredClone(d.hours) as typeof settings.$inferInsert.hours,
    prepMinutes: d.prepMinutes,
    slotMinutes: d.slotMinutes,
    slotCapacity: d.slotCapacity,
    maxDaysAhead: d.maxDaysAhead,
    shopOpen: true,
    closedMessage: null,
    reopenAt: null,
    closedDates: [],
    notificationEmail: business.contact.orderNotificationEmail,
  };
}
