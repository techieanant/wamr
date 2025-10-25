import { eq, and, lt, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { conversationSessions } from '../db/schema.js';
import {
  ConversationSessionModel,
  CreateConversationSession,
  UpdateConversationSession,
  ConversationState,
  generateSessionId,
  getExpirationTime,
  isSessionExpired,
  serializeSearchResults,
  deserializeSearchResults,
  serializeSelectedResult,
  deserializeSelectedResult,
} from '../models/conversation-session.model.js';
import { logger } from '../config/logger.js';

/**
 * Repository for conversation session operations
 */
export class ConversationSessionRepository {
  /**
   * Create a new conversation session
   */
  async create(input: CreateConversationSession): Promise<ConversationSessionModel> {
    const id = input.id || generateSessionId();
    const now = new Date().toISOString();
    const expiresAt = input.expiresAt || getExpirationTime(5);

    const session = await db
      .insert(conversationSessions)
      .values({
        ...input,
        id,
        createdAt: now,
        updatedAt: now,
        expiresAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searchResults: serializeSearchResults(input.searchResults || null) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedResult: serializeSelectedResult(input.selectedResult || null) as any,
      })
      .returning();

    logger.info(
      { sessionId: id, phoneNumberHash: input.phoneNumberHash },
      'Created conversation session'
    );

    return this.mapToModel(session[0]);
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<ConversationSessionModel | null> {
    const sessions = await db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.id, id));

    if (sessions.length === 0) {
      return null;
    }

    const session = this.mapToModel(sessions[0]);

    // Check if expired
    if (isSessionExpired(session.expiresAt)) {
      logger.info({ sessionId: id }, 'Found expired session, will not return');
      return null;
    }

    return session;
  }

  /**
   * Find active session by phone number hash
   */
  async findByPhoneHash(phoneNumberHash: string): Promise<ConversationSessionModel | null> {
    const now = new Date().toISOString();
    const sessions = await db
      .select()
      .from(conversationSessions)
      .where(
        and(
          eq(conversationSessions.phoneNumberHash, phoneNumberHash),
          // Only return non-expired sessions (expiresAt > now)
          gt(conversationSessions.expiresAt, now)
        )
      )
      .orderBy(conversationSessions.createdAt)
      .limit(1);

    if (sessions.length === 0) {
      return null;
    }

    return this.mapToModel(sessions[0]);
  }

  /**
   * Update a conversation session
   */
  async update(
    id: string,
    updates: UpdateConversationSession
  ): Promise<ConversationSessionModel | null> {
    const now = new Date().toISOString();

    // Filter out mediaType if it's "both" since DB only supports "movie" | "series"
    const { mediaType, ...otherUpdates } = updates;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbUpdates: any = {
      ...otherUpdates,
      updatedAt: now,
      searchResults:
        updates.searchResults !== undefined
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serializeSearchResults(updates.searchResults) as any)
          : undefined,
      selectedResult:
        updates.selectedResult !== undefined
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serializeSelectedResult(updates.selectedResult) as any)
          : undefined,
    };

    // Only include mediaType if it's a valid DB value
    if (mediaType && mediaType !== 'both') {
      dbUpdates.mediaType = mediaType;
    }

    const updatedSessions = await db
      .update(conversationSessions)
      .set(dbUpdates)
      .where(eq(conversationSessions.id, id))
      .returning();

    if (updatedSessions.length === 0) {
      logger.warn({ sessionId: id }, 'Conversation session not found for update');
      return null;
    }

    logger.info({ sessionId: id, updates: Object.keys(updates) }, 'Updated conversation session');

    return this.mapToModel(updatedSessions[0]);
  }

  /**
   * Update session state
   */
  async updateState(
    id: string,
    state: ConversationState
  ): Promise<ConversationSessionModel | null> {
    return this.update(id, { state });
  }

  /**
   * Delete a conversation session
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(conversationSessions).where(eq(conversationSessions.id, id));

    logger.info({ sessionId: id }, 'Deleted conversation session');

    return result.changes > 0;
  }

  /**
   * Delete session by phone number hash
   */
  async deleteByPhoneHash(phoneNumberHash: string): Promise<number> {
    const result = await db
      .delete(conversationSessions)
      .where(eq(conversationSessions.phoneNumberHash, phoneNumberHash));

    logger.info(
      { phoneNumberHash, count: result.changes },
      'Deleted conversation sessions for phone'
    );

    return result.changes;
  }

  /**
   * Cleanup expired sessions
   * Should be called periodically (e.g., every minute)
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await db
      .delete(conversationSessions)
      .where(lt(conversationSessions.expiresAt, now));

    if (result.changes > 0) {
      logger.info({ count: result.changes }, 'Cleaned up expired conversation sessions');
    }

    return result.changes;
  }

  /**
   * Get all expired sessions (for sending timeout notifications before deletion)
   */
  async findExpired(): Promise<ConversationSessionModel[]> {
    const now = new Date().toISOString();

    const sessions = await db
      .select()
      .from(conversationSessions)
      .where(lt(conversationSessions.expiresAt, now));

    return sessions.map((session) => this.mapToModel(session));
  }

  /**
   * Extend session expiration time
   */
  async extendExpiration(
    id: string,
    minutesFromNow: number = 5
  ): Promise<ConversationSessionModel | null> {
    const expiresAt = getExpirationTime(minutesFromNow);
    return this.update(id, { expiresAt });
  }

  /**
   * Map database row to model with typed JSON fields
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToModel(session: any): ConversationSessionModel {
    return {
      ...session,
      searchResults: deserializeSearchResults(session.searchResults),
      selectedResult: deserializeSelectedResult(session.selectedResult),
    };
  }
}

// Export singleton instance
export const conversationSessionRepository = new ConversationSessionRepository();
