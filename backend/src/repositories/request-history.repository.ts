import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requestHistory } from '../db/schema.js';
import {
  RequestHistoryModel,
  CreateRequestHistory,
  UpdateRequestHistory,
  RequestHistoryFilters,
  PaginationOptions,
  PaginatedRequestHistory,
  serializeConversationLog,
  deserializeConversationLog,
} from '../models/request-history.model.js';
import { logger } from '../config/logger.js';

/**
 * Repository for request history operations
 */
export class RequestHistoryRepository {
  /**
   * Create a new request history entry
   */
  async create(input: CreateRequestHistory): Promise<RequestHistoryModel> {
    const now = new Date().toISOString();

    const request = await db
      .insert(requestHistory)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversationLog: serializeConversationLog(input.conversationLog || null) as any,
      })
      .returning();

    logger.info(
      {
        requestId: request[0].id,
        phoneNumberHash: input.phoneNumberHash,
        mediaType: input.mediaType,
        title: input.title,
      },
      'Created request history entry'
    );

    return this.mapToModel(request[0]);
  }

  /**
   * Find request by ID
   */
  async findById(id: number): Promise<RequestHistoryModel | null> {
    const requests = await db.select().from(requestHistory).where(eq(requestHistory.id, id));

    if (requests.length === 0) {
      return null;
    }

    return this.mapToModel(requests[0]);
  }

  /**
   * List requests with filtering and pagination
   */
  async list(
    filters: RequestHistoryFilters = {},
    pagination: PaginationOptions = { page: 1, pageSize: 25 }
  ): Promise<PaginatedRequestHistory> {
    const { page, pageSize } = pagination;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [];

    if (filters.phoneNumberHash) {
      conditions.push(eq(requestHistory.phoneNumberHash, filters.phoneNumberHash));
    }

    if (filters.status) {
      conditions.push(eq(requestHistory.status, filters.status));
    }

    // Only filter by mediaType if it's not "both" (which DB doesn't support)
    if (filters.mediaType && filters.mediaType !== 'both') {
      conditions.push(eq(requestHistory.mediaType, filters.mediaType));
    }

    if (filters.serviceType) {
      conditions.push(eq(requestHistory.serviceType, filters.serviceType));
    }

    if (filters.serviceConfigId) {
      conditions.push(eq(requestHistory.serviceConfigId, filters.serviceConfigId));
    }

    if (filters.fromDate) {
      conditions.push(gte(requestHistory.createdAt, filters.fromDate));
    }

    if (filters.toDate) {
      conditions.push(lte(requestHistory.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(requestHistory)
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    // Get paginated data
    const requests = await db
      .select()
      .from(requestHistory)
      .where(whereClause)
      .orderBy(desc(requestHistory.createdAt))
      .limit(pageSize)
      .offset(offset);

    const data = requests.map((request) => this.mapToModel(request));
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Update a request history entry
   */
  async update(id: number, updates: UpdateRequestHistory): Promise<RequestHistoryModel | null> {
    const now = new Date().toISOString();

    const updatedRequests = await db
      .update(requestHistory)
      .set({
        ...updates,
        updatedAt: now,
        conversationLog:
          updates.conversationLog !== undefined
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (serializeConversationLog(updates.conversationLog) as any)
            : undefined,
      })
      .where(eq(requestHistory.id, id))
      .returning();

    if (updatedRequests.length === 0) {
      logger.warn({ requestId: id }, 'Request history not found for update');
      return null;
    }

    logger.info({ requestId: id, updates: Object.keys(updates) }, 'Updated request history');

    return this.mapToModel(updatedRequests[0]);
  }

  /**
   * Update request status
   */
  async updateStatus(id: number, status: string): Promise<RequestHistoryModel | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.update(id, { status: status as any });
  }

  /**
   * Mark request as submitted
   */
  async markSubmitted(
    id: number,
    serviceType: string,
    serviceConfigId: number
  ): Promise<RequestHistoryModel | null> {
    const now = new Date().toISOString();
    return this.update(id, {
      status: 'SUBMITTED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceType: serviceType as any,
      serviceConfigId,
      submittedAt: now,
    });
  }

  /**
   * Mark request as failed
   */
  async markFailed(id: number, errorMessage: string): Promise<RequestHistoryModel | null> {
    return this.update(id, {
      status: 'FAILED',
      errorMessage,
    });
  }

  /**
   * Delete a request history entry
   */
  async delete(id: number): Promise<boolean> {
    const result = await db.delete(requestHistory).where(eq(requestHistory.id, id));

    logger.info({ requestId: id }, 'Deleted request history entry');

    return result.changes > 0;
  }

  /**
   * Get recent requests (for dashboard)
   */
  async getRecent(limit: number = 10): Promise<RequestHistoryModel[]> {
    const requests = await db
      .select()
      .from(requestHistory)
      .orderBy(desc(requestHistory.createdAt))
      .limit(limit);

    return requests.map((request) => this.mapToModel(request));
  }

  /**
   * Get pending/failed requests (for manual approval)
   */
  async getPendingOrFailed(): Promise<RequestHistoryModel[]> {
    const requests = await db
      .select()
      .from(requestHistory)
      .where(and(sql`${requestHistory.status} IN ('PENDING', 'FAILED')`))
      .orderBy(desc(requestHistory.createdAt));

    return requests.map((request) => this.mapToModel(request));
  }

  /**
   * Find requests by status
   */
  async findByStatus(
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'FAILED'
  ): Promise<RequestHistoryModel[]> {
    const requests = await db
      .select()
      .from(requestHistory)
      .where(eq(requestHistory.status, status))
      .orderBy(desc(requestHistory.createdAt));

    return requests.map((request) => this.mapToModel(request));
  }

  /**
   * Find all requests
   */
  async findAll(): Promise<RequestHistoryModel[]> {
    const requests = await db.select().from(requestHistory).orderBy(desc(requestHistory.createdAt));

    return requests.map((request) => this.mapToModel(request));
  }

  /**
   * Get statistics for a date range
   */
  async getStats(
    fromDate: string,
    toDate: string
  ): Promise<{
    total: number;
    submitted: number;
    failed: number;
    pending: number;
  }> {
    const requests = await db
      .select()
      .from(requestHistory)
      .where(and(gte(requestHistory.createdAt, fromDate), lte(requestHistory.createdAt, toDate)));

    const stats = {
      total: requests.length,
      submitted: requests.filter((r) => r.status === 'SUBMITTED').length,
      failed: requests.filter((r) => r.status === 'FAILED').length,
      pending: requests.filter((r) => r.status === 'PENDING').length,
    };

    return stats;
  }

  /**
   * Map database row to model with typed JSON fields
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToModel(request: any): RequestHistoryModel {
    return {
      ...request,
      conversationLog: deserializeConversationLog(request.conversationLog),
    };
  }
}

// Export singleton instance
export const requestHistoryRepository = new RequestHistoryRepository();
