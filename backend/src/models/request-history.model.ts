import { RequestHistory, NewRequestHistory } from '../db/schema.js';

/**
 * Request status values
 * PENDING: Request received but not yet processed
 * APPROVED: Manually approved by admin
 * REJECTED: Manually rejected by admin
 * SUBMITTED: Successfully submitted to media service
 * FAILED: Failed to submit to media service
 */
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'FAILED';

/**
 * Media type for the request
 */
export type MediaType = 'movie' | 'series' | 'both';

/**
 * Service type for the request
 */
export type ServiceType = 'radarr' | 'sonarr' | 'overseerr';

/**
 * Conversation log message structure
 */
export interface ConversationLogMessage {
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  message: string;
  state?: string;
}

/**
 * Request history model with typed JSON fields
 */
export interface RequestHistoryModel extends Omit<RequestHistory, 'conversationLog'> {
  conversationLog: ConversationLogMessage[] | null;
}

/**
 * Create request history input with typed JSON fields
 */
export interface CreateRequestHistory extends Omit<NewRequestHistory, 'conversationLog'> {
  conversationLog?: ConversationLogMessage[] | null;
}

/**
 * Update request history input
 */
export interface UpdateRequestHistory {
  status?: RequestStatus;
  serviceType?: ServiceType | null;
  serviceConfigId?: number | null;
  submittedAt?: string | null;
  errorMessage?: string | null;
  adminNotes?: string | null;
  conversationLog?: ConversationLogMessage[] | null;
  selectedSeasons?: number[] | null;
  notifiedSeasons?: number[] | null;
  notifiedEpisodes?: Record<string, number[]> | null;
  totalSeasons?: number | null;
  updatedAt?: string;
}

/**
 * Request history filter options for list queries
 */
export interface RequestHistoryFilters {
  phoneNumberHash?: string;
  status?: RequestStatus;
  mediaType?: MediaType;
  serviceType?: ServiceType;
  serviceConfigId?: number;
  fromDate?: string; // ISO date string
  toDate?: string; // ISO date string
}

/**
 * Pagination options for request history queries
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * Paginated request history response
 */
export interface PaginatedRequestHistory {
  data: RequestHistoryModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Helper to serialize conversation log for database storage
 */
export function serializeConversationLog(log: ConversationLogMessage[] | null): string | null {
  if (!log) return null;
  return JSON.stringify(log);
}

/**
 * Helper to deserialize conversation log from database
 */
export function deserializeConversationLog(log: string | null): ConversationLogMessage[] | null {
  if (!log) return null;
  try {
    return JSON.parse(log) as ConversationLogMessage[];
  } catch {
    return null;
  }
}

/**
 * Helper to add a message to the conversation log
 */
export function addConversationLogMessage(
  log: ConversationLogMessage[] | null,
  direction: 'incoming' | 'outgoing',
  message: string,
  state?: string
): ConversationLogMessage[] {
  const existingLog = log || [];
  return [
    ...existingLog,
    {
      timestamp: new Date().toISOString(),
      direction,
      message,
      state,
    },
  ];
}

/**
 * Helper to mask phone number for display (show last 4 digits only)
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length <= 4) return phoneNumber;
  return '***' + phoneNumber.slice(-4);
}
