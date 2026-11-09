import { it, type Messages } from './it';

/**
 * The active dictionary. Italian is the default and, for now, the only language.
 * To add one: create `en.ts` (typed as `Messages`) and select it here from a cookie / Accept-Language header.
 */
export const t: Messages = it;

export type { Messages };
