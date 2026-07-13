import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeNextRun } from '../broadcast.service.js';
import { BroadcastService } from '../broadcast.service.js';

vi.mock('../../../repositories/broadcast.repository.js', () => ({
  broadcastRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    findDue: vi.fn(),
    findResumable: vi.fn(),
    insertRecipients: vi.fn(),
    listRecipients: vi.fn(),
    updateRecipient: vi.fn(),
    countRecipients: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../repositories/contact.repository.js', () => ({
  contactRepository: {
    findById: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('../../encryption/encryption.service.js', () => ({
  encryptionService: {
    decrypt: vi.fn(),
  },
}));

vi.mock('../../whatsapp/whatsapp-client.service.js', () => ({
  whatsappClientService: {
    isReady: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../../config/environment.js', () => ({
  env: {
    BROADCAST_DEFAULT_THROTTLE_MS: 10,
    BROADCAST_DEFAULT_JITTER_MS: 0,
    BROADCAST_TICKER_INTERVAL_MS: 20000,
  },
}));

vi.mock('../../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { broadcastRepository } from '../../../repositories/broadcast.repository.js';
import { whatsappClientService } from '../../whatsapp/whatsapp-client.service.js';

const repo = broadcastRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
const wa = whatsappClientService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('computeNextRun', () => {
  it('daily returns next day at time when time already passed', () => {
    const from = new Date('2026-07-12T10:00:00');
    const next = computeNextRun('daily', '09:00', from);
    expect(next.toISOString()).toBe(new Date('2026-07-13T09:00:00').toISOString());
  });

  it('daily returns today at time when time is in the future', () => {
    const from = new Date('2026-07-12T08:00:00');
    const next = computeNextRun('daily', '09:00', from);
    expect(next.toISOString()).toBe(new Date('2026-07-12T09:00:00').toISOString());
  });

  it('weekly returns next matching weekday', () => {
    // 2026-07-12 is a Sunday (getDay() === 0); target Monday (1)
    const from = new Date('2026-07-12T10:00:00');
    const next = computeNextRun('weekly', '08:00', from, 1);
    expect(next.getDay()).toBe(1);
    expect(next.toISOString()).toBe(new Date('2026-07-13T08:00:00').toISOString());
  });

  it('monthly returns next month when day already passed', () => {
    const from = new Date('2026-07-15T10:00:00');
    const next = computeNextRun('monthly', '08:00', from, null, 10);
    expect(next.getMonth()).toBe(7); // August (0-indexed)
    expect(next.getDate()).toBe(10);
  });
});

describe('BroadcastService.compose', () => {
  const service = new BroadcastService();

  beforeEach(() => {
    vi.clearAllMocks();
    repo.create.mockImplementation(async (input: any) => ({ id: 1, ...input }));
  });

  it('throws when messageText is empty', async () => {
    await expect(
      service.compose({ messageText: '', recipientContactIds: [1] } as any)
    ).rejects.toThrow('messageText is required');
  });

  it('throws when no recipients', async () => {
    await expect(
      service.compose({ messageText: 'hi', recipientContactIds: [] } as any)
    ).rejects.toThrow('at least one recipient is required');
  });

  it('creates a one-time scheduled broadcast', async () => {
    const b = await service.compose({
      messageText: 'hi',
      recipientContactIds: [1, 2],
      scheduleType: 'once',
    } as any);
    expect(b.status).toBe('scheduled');
    expect(b.sendAt).toBeTruthy();
  });

  it('creates an active recurring broadcast with nextRunAt', async () => {
    const b = await service.compose({
      messageText: 'hi',
      recipientContactIds: [1],
      scheduleType: 'recurring',
      recurringPattern: 'daily',
      recurringTime: '09:00',
    } as any);
    expect(b.status).toBe('active');
    expect(b.nextRunAt).toBeTruthy();
  });
});

describe('BroadcastService.runSend', () => {
  const service = new BroadcastService();

  beforeEach(() => {
    vi.clearAllMocks();
    wa.isReady.mockReturnValue(true);
    wa.sendMessage.mockResolvedValue({ key: { id: 'x' } });
    repo.listRecipients.mockResolvedValue([
      { id: 1, contactId: 1, phone: '111', contactName: 'Alice', status: 'pending' },
      { id: 2, contactId: 2, phone: '222', contactName: 'Bob', status: 'pending' },
    ]);
    repo.countRecipients.mockResolvedValue(2);
  });

  it('sends to all pending recipients and marks completed', async () => {
    repo.findById.mockResolvedValue({
      id: 1,
      messageText: 'Hello {name}',
      status: 'scheduled',
      throttleMs: 10,
      jitterMs: 0,
      recipientContactIds: [1, 2],
    });
    await service.runSend(1);
    expect(wa.sendMessage).toHaveBeenCalledTimes(2);
    expect(wa.sendMessage).toHaveBeenCalledWith('111', 'Hello Alice');
    expect(wa.sendMessage).toHaveBeenCalledWith('222', 'Hello Bob');
    expect(repo.updateRecipient).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'sent' })
    );
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'completed' }));
  });

  it('marks recipient failed when send throws', async () => {
    repo.findById.mockResolvedValue({
      id: 1,
      messageText: 'hi',
      status: 'scheduled',
      throttleMs: 10,
      jitterMs: 0,
      recipientContactIds: [1],
    });
    wa.sendMessage.mockRejectedValueOnce(new Error('boom'));
    repo.countRecipients.mockResolvedValue(0);
    await service.runSend(1);
    expect(repo.updateRecipient).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('aborts when broadcast is cancelled mid-run', async () => {
    repo.findById
      .mockResolvedValueOnce({
        id: 1,
        messageText: 'hi',
        status: 'scheduled',
        throttleMs: 10,
        jitterMs: 0,
        recipientContactIds: [1],
      })
      .mockResolvedValueOnce({ id: 1, status: 'cancelled' });
    await service.runSend(1);
    expect(wa.sendMessage).not.toHaveBeenCalled();
  });
});

describe('BroadcastService management', () => {
  const service = new BroadcastService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancel sets status cancelled', async () => {
    repo.update.mockResolvedValue({ id: 1, status: 'cancelled' });
    const b = await service.cancel(1);
    expect(repo.update).toHaveBeenCalledWith(1, { status: 'cancelled' });
    expect(b?.status).toBe('cancelled');
  });

  it('pause sets status paused', async () => {
    repo.update.mockResolvedValue({ id: 1, status: 'paused' });
    await service.pause(1);
    expect(repo.update).toHaveBeenCalledWith(1, { status: 'paused' });
  });

  it('retryFailed resets failed recipients to pending', async () => {
    repo.listRecipients.mockResolvedValue([{ id: 5, status: 'failed' }]);
    repo.update.mockResolvedValue({ id: 1, status: 'scheduled' });
    await service.retryFailed(1);
    expect(repo.updateRecipient).toHaveBeenCalledWith(5, { status: 'pending', error: null });
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'scheduled' }));
  });
});
