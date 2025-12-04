import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { ContactModel, CreateContact } from '../models/contact.model.js';
import { logger } from '../config/logger.js';

export class ContactRepository {
  async findByPhoneHash(phoneNumberHash: string): Promise<ContactModel | null> {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.phoneNumberHash, phoneNumberHash));
    if (rows.length === 0) return null;
    return rows[0] as ContactModel;
  }

  async upsert(input: CreateContact): Promise<ContactModel> {
    const now = new Date().toISOString();
    // Try to find existing row
    const existing = await this.findByPhoneHash(input.phoneNumberHash);
    if (existing) {
      const setValues: Partial<ContactModel & { updatedAt: string }> = { updatedAt: now };
      setValues.contactName = input.contactName ?? existing.contactName;
      if (typeof input.phoneNumberEncrypted !== 'undefined')
        setValues.phoneNumberEncrypted = input.phoneNumberEncrypted;
      if (typeof input.phoneNumberHash !== 'undefined')
        setValues.phoneNumberHash = input.phoneNumberHash;

      const updated = await db
        .update(contacts)
        .set(setValues)
        .where(eq(contacts.phoneNumberHash, input.phoneNumberHash))
        .returning();

      if (updated.length > 0) {
        logger.info({ phoneNumberHash: input.phoneNumberHash }, 'Updated contact');
        return updated[0] as ContactModel;
      }

      return existing;
    }

    const created = await db
      .insert(contacts)
      .values({
        phoneNumberHash: input.phoneNumberHash,
        contactName: input.contactName || null,
        phoneNumberEncrypted: input.phoneNumberEncrypted || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info({ phoneNumberHash: input.phoneNumberHash }, 'Created contact');

    return created[0] as ContactModel;
  }

  /**
   * Find multiple contacts by phone number hashes in batch.
   * Returns an array of ContactModel for matches (may be fewer than the input list)
   */
  async findByPhoneHashes(phoneNumberHashes: string[]): Promise<ContactModel[]> {
    if (!phoneNumberHashes || phoneNumberHashes.length === 0) return [];

    // Use a single SQL query to fetch all matching contacts for the provided hashes.
    const rows = await db
      .select()
      .from(contacts)
      .where(inArray(contacts.phoneNumberHash, phoneNumberHashes));

    return rows as ContactModel[];
  }

  async findAll(): Promise<ContactModel[]> {
    const rows = await db.select().from(contacts).orderBy(contacts.createdAt);
    return rows as ContactModel[];
  }

  async findById(id: number): Promise<ContactModel | null> {
    const rows = await db.select().from(contacts).where(eq(contacts.id, id));
    if (rows.length === 0) return null;
    return rows[0] as ContactModel;
  }

  async update(
    id: number,
    input: {
      contactName?: string | null;
      phoneNumberHash?: string;
      phoneNumberEncrypted?: string | null;
    }
  ): Promise<ContactModel | null> {
    const now = new Date().toISOString();
    const setValues: Partial<ContactModel & { updatedAt: string }> = { updatedAt: now };
    if (typeof input.contactName !== 'undefined') setValues.contactName = input.contactName ?? null;
    if (typeof input.phoneNumberHash !== 'undefined')
      setValues.phoneNumberHash = input.phoneNumberHash;
    if (typeof input.phoneNumberEncrypted !== 'undefined')
      setValues.phoneNumberEncrypted = input.phoneNumberEncrypted;

    const updated = await db.update(contacts).set(setValues).where(eq(contacts.id, id)).returning();
    if (updated.length === 0) return null;
    return updated[0] as ContactModel;
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id));
    return result.changes > 0;
  }
}

export const contactRepository = new ContactRepository();
