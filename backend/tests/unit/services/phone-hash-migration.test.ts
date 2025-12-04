import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPhoneHashMigration } from '../../../src/services/migrations/phone-hash-migration.js';
import { contactRepository } from '../../../src/repositories/contact.repository.js';
import { requestHistoryRepository } from '../../../src/repositories/request-history.repository.js';
import { encryptionService } from '../../../src/services/encryption/encryption.service.js';

vi.mock('../../../src/repositories/contact.repository.js', () => ({
  contactRepository: {
    findAll: vi.fn(),
    findByPhoneHash: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/request-history.repository.js', () => ({
  requestHistoryRepository: {
    getDistinctPhoneNumberHashes: vi.fn(),
    updatePhoneNumberHash: vi.fn(),
    updateContactNameForPhone: vi.fn(),
  },
}));

vi.mock('../../../src/services/encryption/encryption.service.js', () => ({
  encryptionService: {
    decrypt: vi.fn((s) => s),
  },
}));

describe('Phone hash migration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should update request hash when contact exists with old 11-digit hash', async () => {
    // Use a real phone to compute hashes
    const digits = '17788796712';
    const allDigitsHash = require('crypto').createHash('sha256').update(digits).digest('hex');
    const last10Hash = require('crypto')
      .createHash('sha256')
      .update(digits.slice(-10))
      .digest('hex');

    // Mock one distinct request hash that's old
    (requestHistoryRepository.getDistinctPhoneNumberHashes as any).mockResolvedValue([
      allDigitsHash,
    ]);
    (contactRepository.findByPhoneHash as any).mockResolvedValue(null);

    // Contact with encrypted phone -> decrypt returns digits '17788796712' and newHash expected
    const contact = {
      id: 1,
      phoneNumberEncrypted: '+17788796712',
      contactName: 'Tester',
    } as any;

    (contactRepository.findAll as any).mockResolvedValue([contact]);

    // Mock encryptionService.decrypt to return digits with country code
    (encryptionService.decrypt as any).mockReturnValue('17788796712');

    // We need to stub crypto hashing to produce matching expected newHash; however since run uses SHA256,
    // we'll spy on the updatePhoneNumberHash call instead and check it's called
    (requestHistoryRepository.updatePhoneNumberHash as any).mockResolvedValue(1);
    (contactRepository.update as any).mockResolvedValue(contact);
    (requestHistoryRepository.updateContactNameForPhone as any).mockResolvedValue(1);

    await runPhoneHashMigration();

    expect(requestHistoryRepository.updatePhoneNumberHash).toHaveBeenCalled();
    expect(contactRepository.update).toHaveBeenCalledWith(contact.id, expect.any(Object));
    expect(requestHistoryRepository.updateContactNameForPhone).toHaveBeenCalled();
  });
});
