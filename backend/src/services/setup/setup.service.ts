import bcrypt from 'bcrypt';
import { setupRepository } from '../../repositories/setup.repository.js';
import { adminUserRepository } from '../../repositories/admin-user.repository.js';
import { passwordService } from '../auth/password.service.js';
import { logger } from '../../config/logger.js';

const BACKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_COUNT = 5;

export class SetupService {
  async isSetupComplete(): Promise<boolean> {
    return setupRepository.isSetupComplete();
  }

  async completeSetup(): Promise<void> {
    return setupRepository.completeSetup();
  }

  async createInitialAdmin(
    username: string,
    password: string
  ): Promise<{ adminId: number; backupCodes: string[] }> {
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    const complexity = passwordService.validateComplexity(password);
    if (!complexity.valid) {
      throw new Error(`Password does not meet requirements: ${complexity.errors.join(', ')}`);
    }

    const isComplete = await this.isSetupComplete();
    if (isComplete) {
      throw new Error('Setup has already been completed');
    }

    const hasUsers = await adminUserRepository.hasAnyUsers();
    if (hasUsers) {
      await this.completeSetup();
      throw new Error('Admin user already exists');
    }

    const passwordHash = await passwordService.hash(password);

    const admin = await adminUserRepository.create({
      username,
      passwordHash,
    });

    logger.info({ userId: admin.id, username }, 'Initial admin user created');

    const backupCodes = await this.generateBackupCodes(admin.id);

    await this.completeSetup();
    logger.info('Setup marked as complete');

    return {
      adminId: admin.id,
      backupCodes,
    };
  }

  private async generateBackupCodes(adminUserId: number): Promise<string[]> {
    const plainCodes: string[] = [];
    const hashedCodes: { adminUserId: number; codeHash: string }[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const plainCode = this.generateBackupCode();
      const normalizedCode = plainCode.replace(/-/g, '');
      const hashedCode = await bcrypt.hash(normalizedCode, 10);

      plainCodes.push(plainCode);
      hashedCodes.push({
        adminUserId,
        codeHash: hashedCode,
      });
    }

    await setupRepository.createBackupCodes(hashedCodes);
    logger.info({ count: BACKUP_CODE_COUNT }, 'Backup codes generated');

    return plainCodes;
  }

  private generateBackupCode(): string {
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      code += BACKUP_CODE_CHARS.charAt(Math.floor(Math.random() * BACKUP_CODE_CHARS.length));
    }
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 10)}`;
  }

  async resetPasswordWithBackupCode(code: string, newPassword: string): Promise<boolean> {
    const complexity = passwordService.validateComplexity(newPassword);
    if (!complexity.valid) {
      throw new Error(`Password does not meet requirements: ${complexity.errors.join(', ')}`);
    }

    const admin = await adminUserRepository.findById(1);
    if (!admin) {
      throw new Error('Admin user not found');
    }

    const backupCodes = await setupRepository.getAllBackupCodes(admin.id);
    if (!backupCodes || backupCodes.length === 0) {
      return false;
    }

    const normalizedCode = code.replace(/-/g, '').toUpperCase();
    let validCode = false;

    for (const backupCode of backupCodes) {
      if (backupCode.isUsed) continue;
      const isValid = await bcrypt.compare(normalizedCode, backupCode.codeHash);
      if (isValid) {
        validCode = true;
        await setupRepository.markBackupCodeUsed(backupCode.id);
        break;
      }
    }

    if (!validCode) {
      return false;
    }

    const newPasswordHash = await passwordService.hash(newPassword);
    await adminUserRepository.updatePassword(admin.id, newPasswordHash);

    logger.info({ userId: admin.id }, 'Password reset with backup code');

    return true;
  }

  async getBackupCodesCount(): Promise<number> {
    const admin = await adminUserRepository.findLatest();
    if (!admin) return 0;
    const backupCodes = await setupRepository.getAllBackupCodes(admin.id);
    return backupCodes.filter((code) => !code.isUsed).length;
  }

  async regenerateBackupCodes(currentPassword: string): Promise<string[]> {
    const admin = await adminUserRepository.findLatest();
    if (!admin) {
      throw new Error('Admin user not found');
    }

    const isValid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isValid) {
      throw new Error('Invalid current password');
    }

    await setupRepository.deleteBackupCodes(admin.id);
    const newCodes = await this.generateBackupCodes(admin.id);

    logger.info({ userId: admin.id }, 'Backup codes regenerated');

    return newCodes;
  }

  async generateBackupCodesForExistingUser(adminUserId: number): Promise<string[]> {
    const plainCodes: string[] = [];
    const hashedCodes: { adminUserId: number; codeHash: string }[] = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const plainCode = this.generateBackupCode();
      const normalizedCode = plainCode.replace(/-/g, '');
      const hashedCode = await bcrypt.hash(normalizedCode, 10);

      plainCodes.push(plainCode);
      hashedCodes.push({
        adminUserId,
        codeHash: hashedCode,
      });
    }

    await setupRepository.createBackupCodes(hashedCodes);
    logger.info(
      { userId: adminUserId, count: BACKUP_CODE_COUNT },
      'Backup codes generated for existing user'
    );

    return plainCodes;
  }

  async hasBackupCodes(adminUserId: number): Promise<boolean> {
    return setupRepository.hasAnyBackupCodes(adminUserId);
  }

  async getRemainingBackupCodesCount(adminUserId: number): Promise<number> {
    return setupRepository.getUnusedBackupCodesCount(adminUserId);
  }
}

export const setupService = new SetupService();
