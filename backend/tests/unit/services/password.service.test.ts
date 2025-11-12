import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PasswordService } from '../../../src/services/auth/password.service';
import bcrypt from 'bcrypt';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    vi.clearAllMocks();
    passwordService = new PasswordService();
  });

  describe('hash', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword';
      (bcrypt.hash as any).mockResolvedValue(hashedPassword);

      const result = await passwordService.hash(password);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(result).toBe(hashedPassword);
    });

    it('should throw error when hashing fails', async () => {
      const error = new Error('Hashing failed');
      (bcrypt.hash as any).mockRejectedValue(error);

      await expect(passwordService.hash('password')).rejects.toThrow('Failed to hash password');
    });
  });

  describe('verify', () => {
    it('should return true for matching password', async () => {
      const password = 'testPassword123';
      const hash = 'hashedPassword';
      (bcrypt.compare as any).mockResolvedValue(true);

      const result = await passwordService.verify(password, hash);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'wrongPassword';
      const hash = 'hashedPassword';
      (bcrypt.compare as any).mockResolvedValue(false);

      const result = await passwordService.verify(password, hash);

      expect(result).toBe(false);
    });

    it('should return false when verification fails', async () => {
      const error = new Error('Comparison failed');
      (bcrypt.compare as any).mockRejectedValue(error);

      const result = await passwordService.verify('password', 'hash');

      expect(result).toBe(false);
    });
  });

  describe('validateComplexity', () => {
    it('should validate a strong password', () => {
      const password = 'StrongPass123!';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password that is too short', () => {
      const password = '12345';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 6 characters long');
    });

    it('should reject password without lowercase letter', () => {
      const password = 'STRONGPASS123!';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without uppercase letter', () => {
      const password = 'strongpass123!';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without digit', () => {
      const password = 'StrongPass!';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one digit');
    });

    it('should reject password without special character', () => {
      const password = 'StrongPass123';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should return multiple errors for weak password', () => {
      const password = 'weak';

      const result = passwordService.validateComplexity(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContain('Password must be at least 6 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one digit');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });
});
