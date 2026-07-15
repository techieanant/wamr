export type BroadcastStatus =
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'cancelled'
  | 'paused'
  | 'active';

export type BroadcastScheduleType = 'once' | 'recurring';
export type RecurringPattern = 'daily' | 'weekly' | 'monthly' | 'minute' | 'hour';

export interface BroadcastRecipient {
  id: number;
  broadcastId: number;
  contactId: number | null;
  phone: string | null;
  contactName: string | null;
  status: 'pending' | 'sent' | 'failed';
  sentAt: string | null;
  error: string | null;
}

export interface Broadcast {
  id: number;
  parentId: number | null;
  label: string | null;
  messageText: string;
  scheduleType: BroadcastScheduleType;
  status: BroadcastStatus;
  recipientContactIds: number[];
  totalRecipients: number | null;
  sentCount: number | null;
  failedCount: number | null;
  sendAt: string | null;
  nextRunAt: string | null;
  recurringPattern: RecurringPattern | null;
  recurringTime: string | null;
  recurringWeekday: number | null;
  recurringMonthDay: number | null;
  recurringInterval: number | null;
  throttleMs: number | null;
  jitterMs: number | null;
  createdAt: string;
  updatedAt: string;
  recipients?: BroadcastRecipient[];
}

export interface ComposeBroadcastInput {
  label?: string;
  messageText: string;
  scheduleType: BroadcastScheduleType;
  recipientContactIds: number[];
  throttleMs?: number;
  jitterMs?: number;
  sendAt?: string;
  recurringPattern?: RecurringPattern;
  recurringTime?: string;
  recurringWeekday?: number;
  recurringMonthDay?: number;
  recurringInterval?: number;
}

export interface BroadcastsResponse {
  broadcasts: Broadcast[];
}
