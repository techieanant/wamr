import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWhere, mockFrom, mockSelect } = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  return { mockWhere, mockFrom, mockSelect };
});

vi.mock('../../db/index.js', () => ({
  db: { select: mockSelect },
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
