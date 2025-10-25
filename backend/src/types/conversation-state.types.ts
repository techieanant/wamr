/**
 * Conversation State Types
 * Defines the state machine for WhatsApp conversation flows
 */

/**
 * Conversation states per data-model.md
 */
export type ConversationState =
  | 'IDLE' // No active conversation
  | 'SEARCHING' // Searching for media results
  | 'AWAITING_SELECTION' // Waiting for user to select from results
  | 'AWAITING_CONFIRMATION' // Waiting for YES/NO confirmation
  | 'PROCESSING'; // Submitting request to service

/**
 * Media type for requests
 */
export type MediaType = 'movie' | 'series' | 'both';

/**
 * Normalized search result
 */
export interface NormalizedResult {
  title: string;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number | null;
  tvdbId: number | null;
  overview: string | null;
  posterPath: string | null;
  serviceId: number; // Which service returned this result
  serviceType: 'radarr' | 'sonarr' | 'overseerr';
  // TV series specific
  seasonCount?: number | null;
}

/**
 * Conversation session data
 */
export interface ConversationSession {
  id: string; // UUID v4
  phoneNumberHash: string;
  state: ConversationState;
  mediaType: MediaType | null;
  searchQuery: string | null;
  searchResults: NormalizedResult[] | null;
  selectedResultIndex: number | null;
  selectedResult: NormalizedResult | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Create conversation session
 */
export interface CreateConversationSession {
  id: string;
  phoneNumberHash: string;
  state: ConversationState;
  mediaType?: MediaType | null;
  searchQuery?: string | null;
  searchResults?: NormalizedResult[] | null;
  selectedResultIndex?: number | null;
  selectedResult?: NormalizedResult | null;
  expiresAt: Date;
}

/**
 * Update conversation session
 */
export interface UpdateConversationSession {
  state?: ConversationState;
  mediaType?: MediaType | null;
  searchQuery?: string | null;
  searchResults?: NormalizedResult[] | null;
  selectedResultIndex?: number | null;
  selectedResult?: NormalizedResult | null;
  expiresAt?: Date;
}
