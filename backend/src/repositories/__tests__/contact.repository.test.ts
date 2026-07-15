import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWhere, mockFrom, mockSelect, mockUpdate, mockSet, mockUpdateWhere } = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockUpdateWhere = vi.fn();
  return { mockWhere, mockFrom, mockSelect, mockUpdate, mockSet, mockUpdateWhere };
});

vi.mock('../../db/index.js', () => ({
  db: { select: mockSelect, update: mockUpdate },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { contactRepository } from '../contact.repository.js';

describe('ContactRepository.findLidOnly', () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReset();
  });

  it('returns contacts stored from an @lid with no phone number', async () => {
    const rows = [
      { id: 1, phoneNumberHash: 'h1', replyJid: '123:7@lid', phoneNumberEncrypted: null },
      { id: 2, phoneNumberHash: 'h2', replyJid: '456:8@lid', phoneNumberEncrypted: null },
    ];
    mockWhere.mockResolvedValue(rows);

    const result = await contactRepository.findLidOnly();

    expect(result).toBe(rows);
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('returns an empty array when no LID-only contacts exist', async () => {
    mockWhere.mockResolvedValue([]);
    const result = await contactRepository.findLidOnly();
    expect(result).toEqual([]);
  });
});

describe('ContactRepository.findByReplyJid', () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReset();
  });

  it('returns the contact matching the reply JID', async () => {
    const row = { id: 1, phoneNumberHash: 'h1', replyJid: '123:7@lid' };
    mockWhere.mockResolvedValue([row]);

    const result = await contactRepository.findByReplyJid('123:7@lid');

    expect(result).toBe(row);
    expect(mockWhere).toHaveBeenCalled();
  });

  it('returns null when no contact uses the reply JID', async () => {
    mockWhere.mockResolvedValue([]);
    const result = await contactRepository.findByReplyJid('999:0@lid');
    expect(result).toBeNull();
  });
});

describe('ContactRepository.rekeyToPn', () => {
  beforeEach(() => {
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReset();
  });

  it('re-keys the contact to the PN hash and stores the encrypted phone', async () => {
    await contactRepository.rekeyToPn('hLid', 'hPn', 'enc', '1234567890@s.whatsapp.net');

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      phoneNumberHash: 'hPn',
      phoneNumberEncrypted: 'enc',
      replyJid: '1234567890@s.whatsapp.net',
    });
    expect(mockUpdateWhere).toHaveBeenCalled();
  });
});
