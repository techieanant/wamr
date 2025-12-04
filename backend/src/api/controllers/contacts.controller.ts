import type { Request, Response, NextFunction } from 'express';
import { contactRepository } from '../../repositories/contact.repository.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { webSocketService, SocketEvents } from '../../services/websocket/websocket.service.js';
import { hashingService } from '../../services/encryption/hashing.service.js';
import { encryptionService } from '../../services/encryption/encryption.service.js';
import { logger } from '../../config/logger.js';

export const getAllContacts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await contactRepository.findAll();
    // Decrypt phone numbers for admin UI and supply a maskedPhone fallback for UI
    const contactsWithPhone = contacts.map((c) => {
      const contact = { ...c } as any;
      if (contact.phoneNumberEncrypted) {
        try {
          contact.phoneNumber = encryptionService.decrypt(contact.phoneNumberEncrypted);
        } catch (err) {
          logger.warn(
            { error: err, contactId: contact.id },
            'Failed to decrypt contact phone number'
          );
          contact.phoneNumber = null;
        }
      } else {
        contact.phoneNumber = null;
      }
      // Add a maskedPhone value for the front-end to display (masked or hash fallback)
      if (contact.phoneNumber) {
        try {
          contact.maskedPhone = hashingService.maskPhoneNumber(contact.phoneNumber);
        } catch {
          contact.maskedPhone = null;
        }
      } else {
        contact.maskedPhone = contact.phoneNumberHash
          ? `${contact.phoneNumberHash.slice(0, 8)}...${contact.phoneNumberHash.slice(-8)}`
          : null;
      }
      return contact;
    });
    return res.json({ contacts: contactsWithPhone });
  } catch (error) {
    logger.error({ error }, 'Failed to list contacts');
    next(error);
    return;
  }
};

export const getContactById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid contact ID' });
    const contact = await contactRepository.findById(id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (contact && contact.phoneNumberEncrypted) {
      try {
        (contact as any).phoneNumber = encryptionService.decrypt(contact.phoneNumberEncrypted);
      } catch (err) {
        logger.warn(
          { error: err, contactId: contact.id },
          'Failed to decrypt contact phone number'
        );
        (contact as any).phoneNumber = null;
      }
    }
    // Add maskedPhone value
    if ((contact as any).phoneNumber) {
      try {
        (contact as any).maskedPhone = hashingService.maskPhoneNumber((contact as any).phoneNumber);
      } catch {
        (contact as any).maskedPhone = null;
      }
    } else {
      (contact as any).maskedPhone = contact.phoneNumberHash
        ? `${contact.phoneNumberHash.slice(0, 8)}...${contact.phoneNumberHash.slice(-8)}`
        : null;
    }
    return res.json(contact);
  } catch (error) {
    logger.error({ error }, 'Failed to get contact');
    next(error);
    return;
  }
};

export const createContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneNumberHash, phoneNumber, contactName } = req.body as {
      phoneNumberHash?: string;
      phoneNumber?: string;
      contactName?: string | null;
    };
    let hashToUse = phoneNumberHash;
    if (!hashToUse && phoneNumber) {
      hashToUse = hashingService.hashPhoneNumber(phoneNumber);
    }
    if (!hashToUse)
      return res.status(400).json({ error: 'phoneNumber or phoneNumberHash is required' });
    // Encrypt phone number for storage, if provided
    const phoneNumberEncrypted = phoneNumber ? encryptionService.encrypt(phoneNumber) : undefined;
    const created = await contactRepository.upsert({
      phoneNumberHash: hashToUse,
      contactName,
      phoneNumberEncrypted,
    });
    if (created && created.phoneNumberEncrypted) {
      try {
        (created as any).phoneNumber = encryptionService.decrypt(created.phoneNumberEncrypted);
      } catch (err) {
        logger.warn(
          { error: err, contactId: created.id },
          'Failed to decrypt created contact phone number'
        );
        (created as any).phoneNumber = null;
      }
    }
    // Add masked phone value for admin UI
    (created as any).maskedPhone = (created as any).phoneNumber
      ? hashingService.maskPhoneNumber((created as any).phoneNumber)
      : created.phoneNumberHash
        ? `${created.phoneNumberHash.slice(0, 8)}...${created.phoneNumberHash.slice(-8)}`
        : null;
    // Optional backfill: set the contactName on previous request_history rows to keep historic lists consistent
    if (contactName) {
      try {
        await requestHistoryRepository.updateContactNameForPhone(hashToUse, contactName, true);
      } catch (err) {
        logger.warn(
          { error: err, hashToUse },
          'Failed to backfill request_history with contactName'
        );
      }
    }

    // Broadcast contact update to clients so UI updates request lists
    try {
      webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
        phoneNumberHash: hashToUse,
        contactName,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ error: err }, 'Failed to emit contact created socket event');
    }
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Failed to create contact');
    next(error);
    return;
  }
};

export const updateContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { contactName, phoneNumber } = req.body as {
      contactName?: string | null;
      phoneNumber?: string;
    };
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid contact ID' });
    let phoneNumberEncrypted: string | undefined;
    let phoneNumberHash: string | undefined;
    if (phoneNumber) {
      phoneNumberEncrypted = encryptionService.encrypt(phoneNumber);
      phoneNumberHash = hashingService.hashPhoneNumber(phoneNumber);
    }
    // If phoneNumberHash is set, and another contact already exists with that hash, block update.
    if (phoneNumberHash) {
      const existing = await contactRepository.findByPhoneHash(phoneNumberHash);
      if (existing && existing.id !== id) {
        return res
          .status(409)
          .json({ error: 'Phone number already associated with another contact' });
      }
    }

    // Fetch previous contact so we can clear backfilled request_history rows on phone change
    const previous = await contactRepository.findById(id);

    const updated = await contactRepository.update(id, {
      contactName,
      phoneNumberEncrypted,
      phoneNumberHash,
    });
    if (updated && updated.phoneNumberEncrypted) {
      try {
        (updated as any).phoneNumber = encryptionService.decrypt(updated.phoneNumberEncrypted);
      } catch (err) {
        logger.warn(
          { error: err, contactId: updated.id },
          'Failed to decrypt updated contact phone number'
        );
        (updated as any).phoneNumber = null;
      }
    }
    if (updated) {
      (updated as any).maskedPhone = (updated as any).phoneNumber
        ? hashingService.maskPhoneNumber((updated as any).phoneNumber)
        : updated.phoneNumberHash
          ? `${updated.phoneNumberHash.slice(0, 8)}...${updated.phoneNumberHash.slice(-8)}`
          : null;
    }
    if (!updated) return res.status(404).json({ error: 'Contact not found' });
    // If phoneNumber changed, update the hash in all associated requests
    if (
      previous &&
      previous.phoneNumberHash &&
      updated.phoneNumberHash &&
      previous.phoneNumberHash !== updated.phoneNumberHash
    ) {
      try {
        await requestHistoryRepository.updatePhoneNumberHash(
          previous.phoneNumberHash,
          updated.phoneNumberHash
        );
        logger.info(
          {
            oldHash: previous.phoneNumberHash.substring(0, 8),
            newHash: updated.phoneNumberHash.substring(0, 8),
          },
          'Updated phone hash in request_history'
        );
      } catch (err) {
        logger.warn(
          { error: err, previousHash: previous.phoneNumberHash, newHash: updated.phoneNumberHash },
          'Failed to update phone hash in request_history'
        );
      }
    }

    // Backfill request_history rows for this phone hash if name present
    if (updated.phoneNumberHash && updated.contactName) {
      try {
        await requestHistoryRepository.updateContactNameForPhone(
          updated.phoneNumberHash,
          updated.contactName,
          true
        );
      } catch (err) {
        logger.warn(
          { error: err, contactId: updated.id },
          'Failed to backfill request_history after update'
        );
      }
    }
    try {
      webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
        phoneNumberHash: updated.phoneNumberHash,
        contactName: updated.contactName,
        timestamp: new Date().toISOString(),
      });
      // If the phone hash changed, notify clients to clear old mappings
      if (
        previous &&
        previous.phoneNumberHash &&
        previous.phoneNumberHash !== updated.phoneNumberHash
      ) {
        webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
          phoneNumberHash: previous.phoneNumberHash,
          contactName: null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.warn({ error: err }, 'Failed to emit contact updated socket event');
    }
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Failed to update contact');
    next(error);
    return;
  }
};

export const deleteContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid contact ID' });
    // fetch the contact to broadcast its phoneNumberHash if present
    const contact = await contactRepository.findById(id);
    const deleted = await contactRepository.delete(id);
    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    try {
      // Clear backfilled contact names in request_history for this phone hash
      if (contact?.phoneNumberHash) {
        try {
          await requestHistoryRepository.clearContactNameForPhone(contact.phoneNumberHash);
        } catch (err) {
          logger.warn(
            { error: err, phoneHash: contact.phoneNumberHash },
            'Failed to clear request_history contact_name on delete'
          );
        }
      }
      webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
        phoneNumberHash: contact?.phoneNumberHash,
        contactName: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ error: err }, 'Failed to emit contact deleted socket event');
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete contact');
    next(error);
    return;
  }
};
