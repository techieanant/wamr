import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactRepository } from '../../../src/repositories/contact.repository';
import { db } from '../../../src/db/index.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({ offset: vi.fn() })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ changes: 0 })) })),
  },
}));

vi.mock('../../../src/db/schema.js', () => ({
  contacts: {
    id: 'id',
    phoneNumberHash: 'phoneNumberHash',
    contactName: 'contactName',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('../../../src/config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe('ContactRepository', () => {
  let repo: ContactRepository;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new ContactRepository();
  });

  it('findByPhoneHashes should return matches for input hashes', async () => {
    const expected = [
      {
        id: 1,
        phoneNumberHash: 'a',
        contactName: 'Alice',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
      },
      {
        id: 2,
        phoneNumberHash: 'b',
        contactName: 'Bob',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
      },
    ];

    (db.select as any).mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(expected) })),
    });

    const result = await repo.findByPhoneHashes(['a', 'b', 'c']);
    expect(result).toEqual(expected);
  });
});
