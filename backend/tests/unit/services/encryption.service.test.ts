import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../../../src/services/encryption/encryption.service';
import { env } from '../../../src/config/environment';

// Mock environment and logger
vi.mock('../../../src/config/environment', () => ({
  env: {
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64 hex chars = 32 bytes
  },
}));

vi.mock('../../../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    encryptionService = new EncryptionService();
  });

  describe('constructor', () => {
    it('should create instance with valid key', () => {
      expect(encryptionService).toBeInstanceOf(EncryptionService);
    });

    it('should throw error for invalid key length', () => {
      const originalKey = env.ENCRYPTION_KEY;
      env.ENCRYPTION_KEY = 'invalid';

      expect(() => new EncryptionService()).toThrow(
        'Invalid ENCRYPTION_KEY: must be 64 hex characters (32 bytes)'
      );

      env.ENCRYPTION_KEY = originalKey;
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const plaintext = 'test-api-key-123';
      const result = encryptionService.encrypt(plaintext);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.split(':')).toHaveLength(3); // iv:authTag:ciphertext
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'test-api-key-123';
      const result1 = encryptionService.encrypt(plaintext);
      const result2 = encryptionService.encrypt(plaintext);

      expect(result1).not.toBe(result2); // Different IVs should produce different results
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const result = encryptionService.encrypt(plaintext);

      expect(result).toBeDefined();
      expect(result.split(':')).toHaveLength(3);
    });

    it('should handle special characters', () => {
      const plaintext = 'special!@#$%^&*()_+{}|:<>?[]\\;\'",./';
      const result = encryptionService.encrypt(plaintext);

      expect(result).toBeDefined();
      expect(result.split(':')).toHaveLength(3);
    });

    it('should handle unicode characters', () => {
      const plaintext = '测试-api-key-🚀';
      const result = encryptionService.encrypt(plaintext);

      expect(result).toBeDefined();
      expect(result.split(':')).toHaveLength(3);
    });

    it('should throw error on encryption failure', () => {
      // Mock crypto.randomBytes to throw error
      const crypto = require('crypto');
      const originalRandomBytes = crypto.randomBytes;
      crypto.randomBytes = vi.fn().mockImplementation(() => {
        throw new Error('Random bytes failed');
      });

      expect(() => encryptionService.encrypt('test')).toThrow('Failed to encrypt data');

      crypto.randomBytes = originalRandomBytes;
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted text successfully', () => {
      const plaintext = 'test-api-key-123';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = 'special!@#$%^&*()_+{}|:<>?[]\\;\'",./';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '测试-api-key-🚀';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid format', () => {
      expect(() => encryptionService.decrypt('invalid')).toThrow('Failed to decrypt data');
      expect(() => encryptionService.decrypt('part1:part2')).toThrow('Failed to decrypt data');
      expect(() => encryptionService.decrypt('part1:part2:part3:part4')).toThrow(
        'Failed to decrypt data'
      );
    });

    it('should throw error for invalid hex', () => {
      expect(() => encryptionService.decrypt('invalid:hex:data')).toThrow('Failed to decrypt data');
    });

    it('should throw error for tampered data', () => {
      const plaintext = 'test-api-key-123';
      const encrypted = encryptionService.encrypt(plaintext);
      const tampered = encrypted.replace(/.$/, '0'); // Change last character

      expect(() => encryptionService.decrypt(tampered)).toThrow('Failed to decrypt data');
    });

    it('should throw error on decryption failure', () => {
      // Mock Buffer.from to throw error for invalid hex
      const originalBufferFrom = Buffer.from;
      Buffer.from = vi.fn().mockImplementation((data: string) => {
        if (data === 'invalid') {
          throw new Error('Invalid hex');
        }
        return originalBufferFrom(data);
      });

      expect(() => encryptionService.decrypt('invalid:hex:data')).toThrow('Failed to decrypt data');

      Buffer.from = originalBufferFrom;
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should maintain data integrity through encrypt/decrypt cycle', () => {
      const testCases = [
        'simple-key',
        'api-key-with-dashes-and-numbers-123456',
        'very-long-api-key-that-might-be-used-in-production-environments-for-testing-purposes',
        '123456789',
        '!@#$%^&*()',
        'mixed case API Key 123',
      ];

      testCases.forEach((testCase) => {
        const encrypted = encryptionService.encrypt(testCase);
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      });
    });
  });
});
