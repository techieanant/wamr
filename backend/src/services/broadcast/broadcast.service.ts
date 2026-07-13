import { broadcastRepository } from '../../repositories/broadcast.repository.js';
import { contactRepository } from '../../repositories/contact.repository.js';
import { encryptionService } from '../encryption/encryption.service.js';
import { whatsappClientService } from '../whatsapp/whatsapp-client.service.js';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import type { Broadcast, ComposeBroadcastInput } from '../../models/broadcast.model.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function replaceName(template: string, name?: string | null): string {
  const safe = name && name.trim() ? name.trim() : '';
  return template.replace(/\{name\}/g, safe);
}

/** Next occurrence for a recurring pattern, strictly after `from`. */
export function computeNextRun(
  pattern: 'daily' | 'weekly' | 'monthly',
  time: string, // HH:MM
  from: Date,
  weekday?: number | null,
  monthDay?: number | null
): Date {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(h, m, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);

  if (pattern === 'daily') {
    while (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }
  if (pattern === 'weekly') {
    const target = typeof weekday === 'number' ? weekday : from.getDay();
    while (next.getDay() !== target || next <= from) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
  // monthly
  const day = Math.min(monthDay ?? from.getDate(), 28);
  next.setDate(day);
  if (next <= from) next.setMonth(next.getMonth() + 1);
  return next;
}

export class BroadcastService {
  async compose(input: ComposeBroadcastInput): Promise<Broadcast> {
    if (!input.messageText || input.messageText.length === 0)
      throw new Error('messageText is required');
    if (input.messageText.length > 4096) throw new Error('messageText exceeds 4096 characters');
    if (!Array.isArray(input.recipientContactIds) || input.recipientContactIds.length === 0)
      throw new Error('at least one recipient is required');

    const now = new Date();
    const isRecurring = input.scheduleType === 'recurring';
    const newBroadcast: Record<string, unknown> = {
      label: input.label ?? null,
      messageText: input.messageText,
      scheduleType: input.scheduleType,
      status: isRecurring ? 'active' : 'scheduled',
      recipientContactIds: input.recipientContactIds,
      throttleMs: input.throttleMs ?? env.BROADCAST_DEFAULT_THROTTLE_MS,
      jitterMs: input.jitterMs ?? env.BROADCAST_DEFAULT_JITTER_MS,
    };
    if (isRecurring) {
      newBroadcast.recurringPattern = input.recurringPattern;
      newBroadcast.recurringTime = input.recurringTime;
      newBroadcast.recurringWeekday = input.recurringWeekday ?? null;
      newBroadcast.recurringMonthDay = input.recurringMonthDay ?? null;
      newBroadcast.nextRunAt = computeNextRun(
        input.recurringPattern!,
        input.recurringTime!,
        now,
        input.recurringWeekday,
        input.recurringMonthDay
      ).toISOString();
    } else {
      newBroadcast.sendAt = input.sendAt ?? now.toISOString();
    }
    return broadcastRepository.create(newBroadcast as any);
  }

  /** Expand recipient_contact_ids into broadcast_recipients rows (decrypt phones, skip LID-only). */
  async expandRecipients(broadcast: Broadcast): Promise<void> {
    const ids = (broadcast.recipientContactIds as number[]) || [];
    const rows = await Promise.all(
      ids.map(async (contactId) => {
        const contact = await contactRepository.findById(contactId);
        if (!contact || !contact.phoneNumberEncrypted) return null; // LID-only: skip
        let phone: string | undefined;
        try {
          phone = encryptionService.decrypt(contact.phoneNumberEncrypted);
        } catch {
          return null;
        }
        return {
          broadcastId: broadcast.id,
          contactId,
          phone,
          contactName: contact.contactName ?? null,
          status: 'pending' as const,
        };
      })
    );
    const valid = rows.filter(Boolean) as any[];
    await broadcastRepository.insertRecipients(valid);
    await broadcastRepository.update(broadcast.id, { totalRecipients: valid.length });
  }

  /** Send to all pending recipients with throttle + jitter. */
  async runSend(broadcastId: number): Promise<void> {
    const broadcast = await broadcastRepository.findById(broadcastId);
    if (!broadcast) return;
    if (broadcast.status === 'cancelled' || broadcast.status === 'paused') return;

    if ((await broadcastRepository.listRecipients(broadcastId)).length === 0) {
      await this.expandRecipients(broadcast);
    }

    await broadcastRepository.update(broadcastId, { status: 'sending' });

    const pending = await broadcastRepository.listRecipients(broadcastId, 'pending');
    const throttle = broadcast.throttleMs ?? env.BROADCAST_DEFAULT_THROTTLE_MS;
    const jitter = broadcast.jitterMs ?? env.BROADCAST_DEFAULT_JITTER_MS;

    for (const recipient of pending) {
      // Re-check status in case cancelled mid-run
      const current = await broadcastRepository.findById(broadcastId);
      if (!current || current.status === 'cancelled') break;

      try {
        if (!whatsappClientService.isReady()) throw new Error('WhatsApp client is not ready');
        const text = replaceName(broadcast.messageText, recipient.contactName);
        await whatsappClientService.sendMessage(recipient.phone!, text);
        await broadcastRepository.updateRecipient(recipient.id, {
          status: 'sent',
          sentAt: new Date().toISOString(),
        });
      } catch (err: any) {
        await broadcastRepository.updateRecipient(recipient.id, {
          status: 'failed',
          error: err?.message ?? String(err),
        });
        logger.warn({ broadcastId, recipientId: recipient.id, err }, 'Broadcast recipient failed');
      }
      const wait = throttle + Math.floor(Math.random() * (jitter + 1));
      await sleep(wait);
    }

    const sent = await broadcastRepository.countRecipients(broadcastId, 'sent');
    const failed = await broadcastRepository.countRecipients(broadcastId, 'failed');
    await broadcastRepository.update(broadcastId, {
      status: 'completed',
      sentCount: sent,
      failedCount: failed,
    });
  }

  /** Spawn a child 'once' broadcast from a recurring parent and advance parent's next_run_at. */
  async spawnRecurringChild(parent: Broadcast): Promise<Broadcast> {
    const child = await broadcastRepository.create({
      parentId: parent.id,
      label: parent.label,
      messageText: parent.messageText,
      scheduleType: 'once',
      status: 'scheduled',
      sendAt: new Date().toISOString(),
      recipientContactIds: parent.recipientContactIds,
      throttleMs: parent.throttleMs,
      jitterMs: parent.jitterMs,
    } as any);
    const next = computeNextRun(
      parent.recurringPattern!,
      parent.recurringTime!,
      new Date(),
      parent.recurringWeekday,
      parent.recurringMonthDay
    );
    await broadcastRepository.update(parent.id, { nextRunAt: next.toISOString() });
    return child;
  }

  async cancel(id: number): Promise<void> {
    await broadcastRepository.update(id, { status: 'cancelled' });
  }

  async pause(id: number): Promise<void> {
    await broadcastRepository.update(id, { status: 'paused' });
  }

  async resume(id: number): Promise<void> {
    const b = await broadcastRepository.findById(id);
    if (!b) return;
    const next = computeNextRun(
      b.recurringPattern!,
      b.recurringTime!,
      new Date(),
      b.recurringWeekday,
      b.recurringMonthDay
    );
    await broadcastRepository.update(id, { status: 'active', nextRunAt: next.toISOString() });
  }

  async retryFailed(id: number): Promise<void> {
    const failed = await broadcastRepository.listRecipients(id, 'failed');
    for (const r of failed) {
      await broadcastRepository.updateRecipient(r.id, { status: 'pending', error: null });
    }
    await broadcastRepository.update(id, { status: 'scheduled', sendAt: new Date().toISOString() });
  }
}

export const broadcastService = new BroadcastService();
