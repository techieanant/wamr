import { describe, it, expect, beforeEach } from 'vitest';
import { HashingService } from '../../../src/services/encryption/hashing.service';

describe('HashingService', () => {
  let hashingService: HashingService;

  beforeEach(() => {
    hashingService = new HashingService();
  });

  describe('hashPhoneNumber', () => {
    it('should hash phone number correctly', () => {
      const phoneNumber = '+1234567890';
      const hash = hashingService.hashPhoneNumber(phoneNumber);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should normalize phone number before hashing', () => {
      const phone1 = '+1 (234) 567-8901';
      const phone2 = '12345678901';
      const phone3 = '+12345678901';

      const hash1 = hashingService.hashPhoneNumber(phone1);
      const hash2 = hashingService.hashPhoneNumber(phone2);
      const hash3 = hashingService.hashPhoneNumber(phone3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hashes for different numbers', () => {
      const phone1 = '1234567890';
      const phone2 = '0987654321';

      const hash1 = hashingService.hashPhoneNumber(phone1);
      const hash2 = hashingService.hashPhoneNumber(phone2);

      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic (same input produces same hash)', () => {
      const phoneNumber = '+1234567890';

      const hash1 = hashingService.hashPhoneNumber(phoneNumber);
      const hash2 = hashingService.hashPhoneNumber(phoneNumber);

      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyPhoneNumber', () => {
    it('should return true for matching phone number', () => {
      const phoneNumber = '+1234567890';
      const hash = hashingService.hashPhoneNumber(phoneNumber);

      const result = hashingService.verifyPhoneNumber(phoneNumber, hash);

      expect(result).toBe(true);
    });

    it('should return true for normalized equivalent', () => {
      const originalPhone = '+1 (234) 567-8901';
      const hash = hashingService.hashPhoneNumber(originalPhone);
      const differentFormat = '12345678901';

      const result = hashingService.verifyPhoneNumber(differentFormat, hash);

      expect(result).toBe(true);
    });

    it('should return false for non-matching phone number', () => {
      const phoneNumber = '+1234567890';
      const hash = hashingService.hashPhoneNumber(phoneNumber);
      const wrongPhone = '+0987654321';

      const result = hashingService.verifyPhoneNumber(wrongPhone, hash);

      expect(result).toBe(false);
    });

    it('should return false for wrong hash', () => {
      const phoneNumber = '+1234567890';
      const wrongHash = 'a'.repeat(64);

      const result = hashingService.verifyPhoneNumber(phoneNumber, wrongHash);

      expect(result).toBe(false);
    });
  });

  describe('maskPhoneNumber', () => {
    it('should mask phone number showing last 4 digits', () => {
      const phoneNumber = '+1234567890';
      const masked = hashingService.maskPhoneNumber(phoneNumber);

      expect(masked).toBe('******7890');
    });

    it('should handle phone numbers with formatting', () => {
      const phoneNumber = '+1 (555) 123-8901';
      const masked = hashingService.maskPhoneNumber(phoneNumber);

      expect(masked).toBe('*******8901');
    });

    it('should mask entire number if 4 digits or less', () => {
      const shortPhone = '123';
      const masked = hashingService.maskPhoneNumber(shortPhone);

      expect(masked).toBe('***');
    });

    it('should handle exactly 4 digits', () => {
      const fourDigit = '1234';
      const masked = hashingService.maskPhoneNumber(fourDigit);

      expect(masked).toBe('****');
    });

    it('should handle more than 4 digits', () => {
      const longPhone = '123456789012345';
      const masked = hashingService.maskPhoneNumber(longPhone);

      expect(masked).toBe('***********2345');
    });
  });
});
