import { ConversationSession, NewConversationSession } from '../db/schema.js';

/**
 * Conversation state machine states
 * IDLE: No active conversation
 * SEARCHING: Media search in progress
 * AWAITING_SELECTION: User needs to select from search results
 * AWAITING_CONFIRMATION: User needs to confirm their selection
 * PROCESSING: Request is being submitted to media service
 */
export type ConversationState =
  | 'IDLE'
  | 'SEARCHING'
  | 'AWAITING_SELECTION'
  | 'AWAITING_CONFIRMATION'
  | 'PROCESSING';

/**
 * Media type for the request
 */
export type MediaType = 'movie' | 'series' | 'both';

/**
 * Normalized search result structure
 */
export interface NormalizedResult {
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
  mediaType: MediaType;
  // For TV series
  seasonCount?: number;
}

/**
 * Conversation session model with typed JSON fields
 */
export interface ConversationSessionModel
  extends Omit<ConversationSession, 'searchResults' | 'selectedResult'> {
  searchResults: NormalizedResult[] | null;
  selectedResult: NormalizedResult | null;
}

/**
 * Create conversation session input with typed JSON fields
 */
export interface CreateConversationSession
  extends Omit<NewConversationSession, 'searchResults' | 'selectedResult'> {
  searchResults?: NormalizedResult[] | null;
  selectedResult?: NormalizedResult | null;
}

/**
 * Update conversation session input with typed JSON fields
 */
export interface UpdateConversationSession {
  state?: ConversationState;
  mediaType?: MediaType | null;
  searchQuery?: string | null;
  searchResults?: NormalizedResult[] | null;
  selectedResultIndex?: number | null;
  selectedResult?: NormalizedResult | null;
  updatedAt?: string;
  expiresAt?: string;
}

/**
 * Helper to create a new conversation session ID
 */
export function generateSessionId(): string {
  // UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Helper to calculate expiration time (5 minutes from now)
 */
export function getExpirationTime(minutesFromNow: number = 5): string {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + minutesFromNow);
  return expiresAt.toISOString();
}

/**
 * Helper to check if a session is expired
 */
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Helper to serialize search results for database storage
 */
export function serializeSearchResults(results: NormalizedResult[] | null): string | null {
  if (!results) return null;
  return JSON.stringify(results);
}

/**
 * Helper to deserialize search results from database
 */
export function deserializeSearchResults(results: string | null): NormalizedResult[] | null {
  if (!results) return null;
  try {
    return JSON.parse(results) as NormalizedResult[];
  } catch {
    return null;
  }
}

/**
 * Helper to serialize selected result for database storage
 */
export function serializeSelectedResult(result: NormalizedResult | null): string | null {
  if (!result) return null;
  return JSON.stringify(result);
}

/**
 * Helper to deserialize selected result from database
 */
export function deserializeSelectedResult(result: string | null): NormalizedResult | null {
  if (!result) return null;
  try {
    return JSON.parse(result) as NormalizedResult;
  } catch {
    return null;
  }
}
