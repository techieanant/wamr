import { contactRepository } from '../../repositories/contact.repository.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import crypto from 'crypto';
import { encryptionService } from '../../services/encryption/encryption.service.js';
import { logger } from '../../config/logger.js';

/**
 * Phone hash migration logic
 * - Ensures request_history phone hashes use the current (last-10-digit) hashing method
 * - When a mismatch is detected, updates request_history and conversation_sessions
 */
export async function runPhoneHashMigration(): Promise<void> {
  try {
    logger.info('Running phone hash migration');

    const distinctHashes = await requestHistoryRepository.getDistinctPhoneNumberHashes();
    if (!distinctHashes || distinctHashes.length === 0) {
      logger.info('No phone hashes found in request_history');
      return;
    }

    // Build a map of contacts using both old-11 and new-10 digit hashes
    const contacts = await contactRepository.findAll();
    const contactMapByAllDigits: Map<string, any> = new Map();
    const contactMapByLast10: Map<string, any> = new Map();

    for (const c of contacts) {
      let decryptedPhone: string | undefined;
      if (c.phoneNumberEncrypted) {
        try {
          decryptedPhone = encryptionService.decrypt(c.phoneNumberEncrypted);
        } catch (err) {
          logger.warn({ contactId: c.id }, 'Failed to decrypt contact phone');
        }
      }
      if (!decryptedPhone) continue;

      const digits = decryptedPhone.replace(/\D/g, '');
      // old style: hash of full digits
      const allDigitsHash = crypto.createHash('sha256').update(digits).digest('hex');
      // new style: last 10 digits hashing
      const last10 = digits.slice(-10);
      const last10Hash = crypto.createHash('sha256').update(last10).digest('hex');
      contactMapByAllDigits.set(allDigitsHash, c);
      contactMapByLast10.set(last10Hash, c);
    }

    for (const reqHash of distinctHashes) {
      // If there's already a contact matching this hash, skip
      const existing = await contactRepository.findByPhoneHash(reqHash);
      if (existing) continue;

      // If we have a contact where the allDigitsHash equals reqHash, we need to migrate
      const contactByAll = contactMapByAllDigits.get(reqHash);
      if (contactByAll) {
        // Compute new last10 hash
        const decrypted = encryptionService.decrypt(contactByAll.phoneNumberEncrypted!);
        const digitStr = decrypted.replace(/\D/g, '');
        const newHash = crypto.createHash('sha256').update(digitStr.slice(-10)).digest('hex');

        // Update request_history and conversation_sessions
        await requestHistoryRepository.updatePhoneNumberHash(reqHash, newHash);
        await contactRepository.update(contactByAll.id, { phoneNumberHash: newHash });
        if (contactByAll.contactName) {
          await requestHistoryRepository.updateContactNameForPhone(
            newHash,
            contactByAll.contactName,
            true
          );
        }

        logger.info({ oldHash: reqHash, newHash }, 'Migrated phone hash to new format');
        continue;
      }

      // Also if request contains encrypted phone (rare), attempt to decrypt and map
      // Fetch unaffected requests to find an encrypted phone (we'll fetch 1 record to decrypt)
      // Note: requestHistoryRepository.getDistinctPhoneNumberHashes doesn't provide example rows here; we'll attempt via contact map from last10
      const contactByLast = contactMapByLast10.get(reqHash);
      if (contactByLast) {
        // Already has mapping but contact may not exist in db as expected; ensure request hash is newHash (it already is)
        continue;
      }
    }

    logger.info('Phone hash migration complete');
  } catch (error) {
    logger.error({ error }, 'Phone hash migration failed');
    throw error;
  }
}

// Allow running as script
if (import.meta.url === `file://${process.argv[1]}`) {
  runPhoneHashMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
