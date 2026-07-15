import type {
  Broadcast,
  NewBroadcast,
  BroadcastRecipient,
  NewBroadcastRecipient,
} from '../db/schema.js';

export type { Broadcast, NewBroadcast, BroadcastRecipient, NewBroadcastRecipient };

export type ComposeBroadcastInput = {
  label?: string | null;
  messageText: string;
  recipientContactIds: number[];
  scheduleType: 'once' | 'recurring';
  sendAt?: string | null; // ISO, for 'once'
  recurringPattern?: 'daily' | 'weekly' | 'monthly' | 'minute' | 'hour' | null;
  recurringTime?: string | null; // HH:MM
  recurringWeekday?: number | null; // 0-6
  recurringMonthDay?: number | null; // 1-31
  recurringInterval?: number | null; // every N of the pattern unit (e.g. every N minutes/hours)
  throttleMs?: number;
  jitterMs?: number;
};
