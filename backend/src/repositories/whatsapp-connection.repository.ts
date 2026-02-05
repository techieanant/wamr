import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { whatsappConnections } from '../db/schema.js';
import type {
  WhatsAppConnection,
  CreateWhatsAppConnection,
  UpdateWhatsAppConnection,
} from '../models/whatsapp-connection.model.js';

export class WhatsAppConnectionRepository {
  /**
   * Get active WhatsApp connection
   */
  async getActive(): Promise<WhatsAppConnection | undefined> {
    const result = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.status, 'CONNECTED'))
      .limit(1);

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Get connection by phone number hash
   */
  async findByPhoneHash(phoneHash: string): Promise<WhatsAppConnection | undefined> {
    const result = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.phoneNumberHash, phoneHash))
      .limit(1);

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Upsert WhatsApp connection (insert or update)
   */
  async upsert(data: CreateWhatsAppConnection): Promise<WhatsAppConnection> {
    // Always use the first connection record (single connection system)
    const connections = await this.findAll();

    if (connections.length > 0) {
      // Update the first (and should be only) connection
      const result = await db
        .update(whatsappConnections)
        .set({
          phoneNumberHash: data.phoneNumberHash || connections[0].phoneNumberHash,
          status: data.status,
          lastConnectedAt:
            data.lastConnectedAt?.toISOString() ||
            connections[0].lastConnectedAt?.toISOString() ||
            null,
          qrCodeGeneratedAt: data.qrCodeGeneratedAt?.toISOString() || null,
          autoApprovalMode: data.autoApprovalMode || connections[0].autoApprovalMode,
          exceptionsEnabled: data.exceptionsEnabled ?? connections[0].exceptionsEnabled,
          exceptionContacts:
            data.exceptionContacts !== undefined
              ? data.exceptionContacts
              : connections[0].exceptionContacts,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(whatsappConnections.id, connections[0].id))
        .returning();

      return this.mapToModel(result[0]);
    }

    // Insert new (first connection)
    const result = await db
      .insert(whatsappConnections)
      .values({
        phoneNumberHash: data.phoneNumberHash || 'pending',
        status: data.status,
        lastConnectedAt: data.lastConnectedAt?.toISOString() || null,
        qrCodeGeneratedAt: data.qrCodeGeneratedAt?.toISOString() || null,
      })
      .returning();

    return this.mapToModel(result[0]);
  }

  /**
   * Update connection
   */
  async update(
    id: number,
    data: UpdateWhatsAppConnection
  ): Promise<WhatsAppConnection | undefined> {
    const updateData: Record<string, string | number | null | string[]> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.lastConnectedAt !== undefined) {
      updateData.lastConnectedAt = data.lastConnectedAt?.toISOString() || null;
    }
    if (data.qrCodeGeneratedAt !== undefined) {
      updateData.qrCodeGeneratedAt = data.qrCodeGeneratedAt?.toISOString() || null;
    }
    if (data.autoApprovalMode !== undefined) {
      updateData.autoApprovalMode = data.autoApprovalMode;
    }
    if (data.exceptionsEnabled !== undefined) {
      updateData.exceptionsEnabled = data.exceptionsEnabled ? 1 : 0;
    }
    if (data.exceptionContacts !== undefined) {
      updateData.exceptionContacts = data.exceptionContacts;
    }

    const result = await db
      .update(whatsappConnections)
      .set(updateData)
      .where(eq(whatsappConnections.id, id))
      .returning();

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Update message filter and message source options
   */
  async updateMessageFilter(
    filterType: 'prefix' | 'keyword' | null,
    filterValue: string | null,
    options?: {
      processFromSelf?: boolean;
      processGroups?: boolean;
      markOnlineOnConnect?: boolean;
    }
  ): Promise<WhatsAppConnection | undefined> {
    const connections = await this.findAll();

    if (connections.length === 0) {
      return undefined;
    }

    const setValues: Record<string, unknown> = {
      filterType,
      filterValue,
      updatedAt: new Date().toISOString(),
    };
    if (options?.processFromSelf !== undefined) {
      setValues.processFromSelf = options.processFromSelf ? 1 : 0;
    }
    if (options?.processGroups !== undefined) {
      setValues.processGroups = options.processGroups ? 1 : 0;
    }
    if (options?.markOnlineOnConnect !== undefined) {
      setValues.markOnlineOnConnect = options.markOnlineOnConnect ? 1 : 0;
    }

    const result = await db
      .update(whatsappConnections)
      .set(setValues as Record<string, string | number>)
      .where(eq(whatsappConnections.id, connections[0].id))
      .returning();

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Get all connections
   */
  async findAll(): Promise<WhatsAppConnection[]> {
    const result = await db.select().from(whatsappConnections);

    return result.map((row) => this.mapToModel(row));
  }

  /**
   * Map database row to model
   */
  private mapToModel(row: typeof whatsappConnections.$inferSelect): WhatsAppConnection {
    return {
      id: row.id,
      phoneNumberHash: row.phoneNumberHash,
      status: row.status,
      lastConnectedAt: row.lastConnectedAt ? new Date(row.lastConnectedAt) : null,
      qrCodeGeneratedAt: row.qrCodeGeneratedAt ? new Date(row.qrCodeGeneratedAt) : null,
      filterType: row.filterType as 'prefix' | 'keyword' | null,
      filterValue: row.filterValue,
      processFromSelf: Boolean(row.processFromSelf),
      processGroups: Boolean(row.processGroups),
      markOnlineOnConnect: Boolean(row.markOnlineOnConnect),
      autoApprovalMode:
        (row.autoApprovalMode as 'auto_approve' | 'auto_deny' | 'manual') || 'auto_approve',
      exceptionsEnabled: Boolean(row.exceptionsEnabled),
      exceptionContacts: Array.isArray(row.exceptionContacts) ? row.exceptionContacts : [],
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export const whatsappConnectionRepository = new WhatsAppConnectionRepository();
