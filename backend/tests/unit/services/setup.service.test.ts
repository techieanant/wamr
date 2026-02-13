import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { SetupService } from '../../../src/services/setup/setup.service';
import { setupRepository } from '../../../src/repositories/setup.repository';
import { adminUserRepository } from '../../../src/repositories/admin-user.repository';
import { passwordService } from '../../../src/services/auth/password.service';
import bcrypt from 'bcrypt';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('../../../src/repositories/setup.repository', () => ({
  setupRepository: {
    isSetupComplete: vi.fn(),
    completeSetup: vi.fn(),
    createBackupCodes: vi.fn(),
    getAllBackupCodes: vi.fn(),
    getBackupCodes: vi.fn(),
    deleteBackupCodes: vi.fn(),
    markBackupCodeUsed: vi.fn(),
    hasAnyBackupCodes: vi.fn(),
    getUnusedBackupCodesCount: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/admin-user.repository', () => ({
  adminUserRepository: {
    hasAnyUsers: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findLatest: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

vi.mock('../../../src/services/auth/password.service', () => ({
  passwordService: {
    hash: vi.fn(),
    validateComplexity: vi.fn(),
  },
}));

describe('SetupService', () => {
  let setupService: SetupService;

  beforeEach(() => {
    vi.clearAllMocks();
    setupService = new SetupService();
  });

  describe('isSetupComplete', () => {
    it('should return true when setup is complete', async () => {
      (setupRepository.isSetupComplete as Mock).mockResolvedValue(true);

      const result = await setupService.isSetupComplete();

      expect(result).toBe(true);
      expect(setupRepository.isSetupComplete).toHaveBeenCalled();
    });

    it('should return false when setup is not complete', async () => {
      (setupRepository.isSetupComplete as Mock).mockResolvedValue(false);

      const result = await setupService.isSetupComplete();

      expect(result).toBe(false);
    });
  });

  describe('completeSetup', () => {
    it('should call repository to complete setup', async () => {
      (setupRepository.completeSetup as Mock).mockResolvedValue(undefined);

      await setupService.completeSetup();

      expect(setupRepository.completeSetup).toHaveBeenCalled();
    });
  });

  describe('createInitialAdmin', () => {
    it('should create admin user successfully with valid credentials', async () => {
      const username = 'admin';
      const password = 'Password123!';
      const mockUser = {
        id: 1,
        username,
        passwordHash: 'hashedpassword',
        createdAt: new Date(),
        lastLoginAt: null,
      };

      (setupRepository.isSetupComplete as Mock).mockResolvedValue(false);
      (adminUserRepository.hasAnyUsers as Mock).mockResolvedValue(false);
      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });
      (passwordService.hash as Mock).mockResolvedValue('hashedpassword');
      (adminUserRepository.create as Mock).mockResolvedValue(mockUser);
      (setupRepository.createBackupCodes as Mock).mockResolvedValue(undefined);
      (setupRepository.completeSetup as Mock).mockResolvedValue(undefined);

      const result = await setupService.createInitialAdmin(username, password);

      expect(result.adminId).toBe(1);
      expect(result.backupCodes).toHaveLength(5);
      expect(passwordService.validateComplexity).toHaveBeenCalledWith(password);
      expect(passwordService.hash).toHaveBeenCalledWith(password);
      expect(adminUserRepository.create).toHaveBeenCalledWith({
        username,
        passwordHash: 'hashedpassword',
      });
      expect(setupRepository.completeSetup).toHaveBeenCalled();
    });

    it('should throw error when username is too short', async () => {
      await expect(
        setupService.createInitialAdmin('ad', 'Password123!')
      ).rejects.toThrow('Username must be at least 3 characters');
    });

    it('should throw error when password does not meet complexity', async () => {
      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: false,
        errors: ['Password must be at least 4 characters long'],
      });

      await expect(
        setupService.createInitialAdmin('admin', 'abc')
      ).rejects.toThrow(
        'Password does not meet requirements: Password must be at least 4 characters long'
      );
    });

    it('should throw error when setup is already complete', async () => {
      (setupRepository.isSetupComplete as Mock).mockResolvedValue(true);
      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });

      await expect(
        setupService.createInitialAdmin('admin', 'Password123!')
      ).rejects.toThrow('Setup has already been completed');
    });

    it('should throw error when admin user already exists', async () => {
      (setupRepository.isSetupComplete as Mock).mockResolvedValue(false);
      (adminUserRepository.hasAnyUsers as Mock).mockResolvedValue(true);
      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });

      await expect(
        setupService.createInitialAdmin('admin', 'Password123!')
      ).rejects.toThrow('Admin user already exists');
    });
  });

  describe('generateBackupCodesForExistingUser', () => {
    it('should generate 5 backup codes for existing user', async () => {
      (bcrypt.hash as Mock).mockResolvedValue('hashedcode');
      (setupRepository.createBackupCodes as Mock).mockResolvedValue(undefined);

      const codes = await setupService.generateBackupCodesForExistingUser(1);

      expect(codes).toHaveLength(5);
      expect(setupRepository.createBackupCodes).toHaveBeenCalled();

      // Verify codes are in correct format (XXXX-XXXX-XX)
      codes.forEach((code) => {
        expect(code).toMatch(/^\w{4}-\w{4}-\w{2}$/);
      });
    });
  });

  describe('resetPasswordWithBackupCode', () => {
    it('should reset password with valid backup code', async () => {
      // Code is normalized (no dashes) by the controller before calling service
      const code = 'ABCDEFGHIJ';
      const newPassword = 'NewPassword123!';
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'oldhash',
        createdAt: new Date(),
        lastLoginAt: null,
      };
      const mockBackupCodes = [
        {
          id: 1,
          adminUserId: 1,
          codeHash: 'hashedcode',
          isUsed: false,
          usedAt: null,
          createdAt: new Date(),
        },
      ];

      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });
      (adminUserRepository.findById as Mock).mockResolvedValue(mockUser);
      (setupRepository.getAllBackupCodes as Mock).mockResolvedValue(
        mockBackupCodes
      );
      (bcrypt.compare as Mock).mockResolvedValue(true);
      (setupRepository.markBackupCodeUsed as Mock).mockResolvedValue(undefined);
      (passwordService.hash as Mock).mockResolvedValue('newhash');
      (adminUserRepository.updatePassword as Mock).mockResolvedValue(undefined);

      const result = await setupService.resetPasswordWithBackupCode(
        code,
        newPassword
      );

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('ABCDEFGHIJ', 'hashedcode');
      expect(setupRepository.markBackupCodeUsed).toHaveBeenCalledWith(1);
      expect(adminUserRepository.updatePassword).toHaveBeenCalledWith(
        1,
        'newhash'
      );
    });

    it('should return false for invalid backup code', async () => {
      const code = 'INVALID-CODE';
      const newPassword = 'NewPassword123!';
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'oldhash',
        createdAt: new Date(),
        lastLoginAt: null,
      };

      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });
      (adminUserRepository.findById as Mock).mockResolvedValue(mockUser);
      (setupRepository.getAllBackupCodes as Mock).mockResolvedValue([]);

      const result = await setupService.resetPasswordWithBackupCode(
        code,
        newPassword
      );

      expect(result).toBe(false);
    });

    it('should return false for already used backup code', async () => {
      const code = 'ABCD-EFGH-IJ';
      const newPassword = 'NewPassword123!';
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'oldhash',
        createdAt: new Date(),
        lastLoginAt: null,
      };
      const mockBackupCodes = [
        {
          id: 1,
          adminUserId: 1,
          codeHash: 'hashedcode',
          isUsed: true,
          usedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: true,
        errors: [],
      });
      (adminUserRepository.findById as Mock).mockResolvedValue(mockUser);
      (setupRepository.getAllBackupCodes as Mock).mockResolvedValue(
        mockBackupCodes
      );

      const result = await setupService.resetPasswordWithBackupCode(
        code,
        newPassword
      );

      expect(result).toBe(false);
    });

    it('should throw error when password does not meet complexity', async () => {
      (passwordService.validateComplexity as Mock).mockReturnValue({
        valid: false,
        errors: ['Password too weak'],
      });

      await expect(
        setupService.resetPasswordWithBackupCode('CODE123', 'weak')
      ).rejects.toThrow(
        'Password does not meet requirements: Password too weak'
      );
    });
  });

  describe('hasBackupCodes', () => {
    it('should return true when user has backup codes', async () => {
      (setupRepository.hasAnyBackupCodes as Mock).mockResolvedValue(true);

      const result = await setupService.hasBackupCodes(1);

      expect(result).toBe(true);
      expect(setupRepository.hasAnyBackupCodes).toHaveBeenCalledWith(1);
    });

    it('should return false when user has no backup codes', async () => {
      (setupRepository.hasAnyBackupCodes as Mock).mockResolvedValue(false);

      const result = await setupService.hasBackupCodes(1);

      expect(result).toBe(false);
    });
  });

  describe('getRemainingBackupCodesCount', () => {
    it('should return count of unused backup codes', async () => {
      (setupRepository.getUnusedBackupCodesCount as Mock).mockResolvedValue(3);

      const result = await setupService.getRemainingBackupCodesCount(1);

      expect(result).toBe(3);
      expect(setupRepository.getUnusedBackupCodesCount).toHaveBeenCalledWith(1);
    });
  });
});
