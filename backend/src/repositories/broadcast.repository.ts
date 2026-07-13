import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { broadcasts, broadcastRecipients } from '../db/schema.js';
import type {
  Broadcast,
  NewBroadcast,
  BroadcastRecipient,
  NewBroadcastRecipient,
} from '../db/schema.js';

export class BroadcastRepository {
  async create(input: NewBroadcast): Promise<Broadcast> {
    const [row] = await db.insert(broadcasts).values(input).returning();
    return row as Broadcast;
  }

  async findById(id: number): Promise<Broadcast | null> {
    const rows = await db.select().from(broadcasts).where(eq(broadcasts.id, id));
    return rows[0] ?? null;
  }

  async update(id: number, patch: Partial<Broadcast>): Promise<Broadcast | null> {
    const [row] = await db
      .update(broadcasts)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(broadcasts.id, id))
      .returning();
    return row ?? null;
  }

  /** List for History + Scheduled tabs. Exclude recurring children (parentId set) from history. */
  async list(
    opts: { status?: Broadcast['status']; includeChildren?: boolean } = {}
  ): Promise<Broadcast[]> {
    const conditions = [];
    if (opts.status) conditions.push(eq(broadcasts.status, opts.status));
    if (!opts.includeChildren) conditions.push(isNull(broadcasts.parentId));
    const rows = await db
      .select()
      .from(broadcasts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(broadcasts.createdAt));
    return rows as Broadcast[];
  }

  /** Due one-time (scheduled & send_at<=now) or active recurring (next_run_at<=now). */
  async findDue(nowIso: string): Promise<Broadcast[]> {
    const rows = await db
      .select()
      .from(broadcasts)
      .where(
        sql`${broadcasts.status} IN ('scheduled', 'active')
          AND (
            (${broadcasts.sendAt} IS NOT NULL AND ${broadcasts.sendAt} <= ${nowIso})
            OR (${broadcasts.nextRunAt} IS NOT NULL AND ${broadcasts.nextRunAt} <= ${nowIso})
          )`
      );
    return rows as Broadcast[];
  }

  /** Broadcasts interrupted mid-send (status 'sending') to resume after restart. */
  async findResumable(): Promise<Broadcast[]> {
    const rows = await db.select().from(broadcasts).where(eq(broadcasts.status, 'sending'));
    return rows as Broadcast[];
  }

  // ---- Recipients ----
  async insertRecipients(rows: NewBroadcastRecipient[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(broadcastRecipients).values(rows);
  }

  async listRecipients(
    broadcastId: number,
    status?: 'pending' | 'sent' | 'failed'
  ): Promise<BroadcastRecipient[]> {
    const conditions = [eq(broadcastRecipients.broadcastId, broadcastId)];
    if (status) conditions.push(eq(broadcastRecipients.status, status));
    const rows = await db
      .select()
      .from(broadcastRecipients)
      .where(and(...conditions));
    return rows as BroadcastRecipient[];
  }

  async updateRecipient(id: number, patch: Partial<BroadcastRecipient>): Promise<void> {
    await db.update(broadcastRecipients).set(patch).where(eq(broadcastRecipients.id, id));
  }

  async countRecipients(
    broadcastId: number,
    status: 'pending' | 'sent' | 'failed'
  ): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.status, status)
        )
      );
    return Number(rows[0]?.count ?? 0);
  }

  async delete(id: number): Promise<void> {
    await db.delete(broadcasts).where(eq(broadcasts.id, id));
  }
}

export const broadcastRepository = new BroadcastRepository();
