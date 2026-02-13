import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { setupStatus, backupCodes } from '../db/schema.js';
import type { BackupCode, CreateBackupCode } from '../models/setup.model.js';

export class SetupRepository {
  async isSetupComplete(): Promise<boolean> {
    const result = await db
      .select({ isCompleted: setupStatus.isCompleted })
      .from(setupStatus)
      .limit(1);

    return result[0]?.isCompleted ?? false;
  }

  async completeSetup(): Promise<void> {
    await db
      .insert(setupStatus)
      .values({
        isCompleted: true,
        completedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: setupStatus.id,
        set: {
          isCompleted: true,
          completedAt: new Date().toISOString(),
        },
      });
  }

  async createBackupCodes(codes: CreateBackupCode[]): Promise<void> {
    await db.insert(backupCodes).values(codes);
  }

  async findValidBackupCode(codeHash: string): Promise<BackupCode | undefined> {
    const result = await db
      .select()
      .from(backupCodes)
      .where(eq(backupCodes.codeHash, codeHash))
      .limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0],
      isUsed: Boolean(result[0].isUsed),
      createdAt: new Date(result[0].createdAt),
      usedAt: result[0].usedAt ? new Date(result[0].usedAt) : null,
    };
  }

  async markBackupCodeUsed(id: number): Promise<void> {
    await db
      .update(backupCodes)
      .set({
        isUsed: true,
        usedAt: new Date().toISOString(),
      })
      .where(eq(backupCodes.id, id));
  }

  async getUnusedBackupCodesCount(adminUserId: number): Promise<number> {
    const result = await db
      .select({ id: backupCodes.id })
      .from(backupCodes)
      .where(and(eq(backupCodes.adminUserId, adminUserId), eq(backupCodes.isUsed, false)));

    return result.length;
  }

  async hasAnyBackupCodes(adminUserId: number): Promise<boolean> {
    const result = await db
      .select({ id: backupCodes.id })
      .from(backupCodes)
      .where(eq(backupCodes.adminUserId, adminUserId))
      .limit(1);

    return result.length > 0;
  }

  async getAllBackupCodes(adminUserId: number): Promise<BackupCode[]> {
    const result = await db
      .select()
      .from(backupCodes)
      .where(eq(backupCodes.adminUserId, adminUserId));

    return result.map((row) => ({
      ...row,
      isUsed: Boolean(row.isUsed),
      createdAt: new Date(row.createdAt),
      usedAt: row.usedAt ? new Date(row.usedAt) : null,
    }));
  }

  async getBackupCodes(adminUserId: number): Promise<BackupCode[]> {
    const result = await db
      .select()
      .from(backupCodes)
      .where(eq(backupCodes.adminUserId, adminUserId));

    return result.map((row) => ({
      ...row,
      isUsed: Boolean(row.isUsed),
      createdAt: new Date(row.createdAt),
      usedAt: row.usedAt ? new Date(row.usedAt) : null,
    }));
  }

  async deleteBackupCodes(adminUserId: number): Promise<void> {
    await db.delete(backupCodes).where(eq(backupCodes.adminUserId, adminUserId));
  }
}

export const setupRepository = new SetupRepository();
