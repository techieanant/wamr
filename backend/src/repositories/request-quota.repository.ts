import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requestQuotas, requestHistory } from '../db/schema.js';
import {
  RequestQuotaModel,
  CreateRequestQuota,
  UpdateRequestQuota,
  QuotaWindowType,
} from '../models/request-quota.model.js';
import { logger } from '../config/logger.js';

export class RequestQuotaRepository {
  async findByPhoneHash(phoneNumberHash: string): Promise<RequestQuotaModel | null> {
    const rows = await db
      .select()
      .from(requestQuotas)
      .where(eq(requestQuotas.phoneNumberHash, phoneNumberHash));
    return rows.length > 0 ? (rows[0] as RequestQuotaModel) : null;
  }

  async create(input: CreateRequestQuota): Promise<RequestQuotaModel> {
    const now = new Date().toISOString();
    const rows = await db
      .insert(requestQuotas)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    logger.info({ phoneHash: input.phoneNumberHash }, 'Created request quota');
    return rows[0] as RequestQuotaModel;
  }

  async update(
    phoneNumberHash: string,
    input: UpdateRequestQuota
  ): Promise<RequestQuotaModel | null> {
    const now = new Date().toISOString();
    const rows = await db
      .update(requestQuotas)
      .set({
        ...input,
        updatedAt: now,
      })
      .where(eq(requestQuotas.phoneNumberHash, phoneNumberHash))
      .returning();
    return rows.length > 0 ? (rows[0] as RequestQuotaModel) : null;
  }

  async upsert(input: CreateRequestQuota): Promise<RequestQuotaModel> {
    const existing = await this.findByPhoneHash(input.phoneNumberHash);
    if (existing) {
      const updated = await this.update(input.phoneNumberHash, {
        maxRequests: input.maxRequests,
        windowType: input.windowType,
      });
      return updated!;
    }
    return this.create(input);
  }

  async delete(phoneNumberHash: string): Promise<boolean> {
    const result = await db
      .delete(requestQuotas)
      .where(eq(requestQuotas.phoneNumberHash, phoneNumberHash));
    return result.changes > 0;
  }

  async countRequestsInWindow(
    phoneNumberHash: string,
    windowType: QuotaWindowType
  ): Promise<number> {
    const windowStart = this.getWindowStart(windowType);
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(requestHistory)
      .where(
        and(
          eq(requestHistory.phoneNumberHash, phoneNumberHash),
          gte(requestHistory.createdAt, windowStart.toISOString()),
          sql`${requestHistory.status} IN ('SUBMITTED', 'PENDING')`
        )
      );
    return countResult[0]?.count || 0;
  }

  private getWindowStart(windowType: QuotaWindowType): Date {
    const now = new Date();
    switch (windowType) {
      case 'daily':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      case 'weekly': {
        const dayOfWeek = now.getUTCDay();
        const sunday = new Date(now);
        sunday.setUTCDate(now.getUTCDate() - dayOfWeek);
        sunday.setUTCHours(0, 0, 0, 0);
        return sunday;
      }
      case 'monthly':
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
  }
}

export const requestQuotaRepository = new RequestQuotaRepository();
