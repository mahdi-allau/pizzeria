import { asc, gt, lt, max } from 'drizzle-orm';
import type { Db, Tx } from '@/db/client';
import { realtimeEvents } from '@/db/schema';

/**
 * Event feed behind the admin's live updates (SSE). Events are plain rows, so any serverless instance can publish
 * and any other can stream them; clients resume after a disconnect with `Last-Event-ID` = last seen id.
 * Publish inside the same transaction that changes the order, so a rolled-back change never emits an event.
 */

export type RealtimeKind =
  | 'order.created'
  | 'order.paid'
  | 'order.status'
  | 'order.updated'
  | 'settings.updated'
  | 'catalog.updated';

export interface RealtimeEvent {
  id: number;
  kind: string;
  orderId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

export async function publishEvent(
  db: Db | Tx,
  kind: RealtimeKind,
  orderId: string | null,
  data: Record<string, unknown> = {},
): Promise<number> {
  const [row] = await db.insert(realtimeEvents).values({ kind, orderId, data }).returning({ id: realtimeEvents.id });
  return row!.id;
}

/** Events with id > afterId, oldest first. */
export async function readEventsSince(db: Db, afterId: number, limit = 100): Promise<RealtimeEvent[]> {
  const rows = await db
    .select()
    .from(realtimeEvents)
    .where(gt(realtimeEvents.id, afterId))
    .orderBy(asc(realtimeEvents.id))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind, orderId: r.orderId, data: r.data, createdAt: r.createdAt }));
}

export async function latestEventId(db: Db): Promise<number> {
  const [row] = await db.select({ id: max(realtimeEvents.id) }).from(realtimeEvents);
  return row?.id ?? 0;
}

/** Deletes events older than `olderThan`; returns how many were removed. */
export async function pruneEvents(db: Db, olderThan: Date): Promise<number> {
  const deleted = await db.delete(realtimeEvents).where(lt(realtimeEvents.createdAt, olderThan)).returning({ id: realtimeEvents.id });
  return deleted.length;
}
