import crypto from 'crypto';

/**
 * SHA-256 hashing service for phone numbers
 * Provides privacy by hashing phone numbers before storage
 */
export class HashingService {
  /**
   * Hash phone number with SHA-256
   * @param phoneNumber - Phone number to hash (will be normalized)
   * @returns SHA-256 hash (64 hex characters)
   */
  hashPhoneNumber(phoneNumber: string): string {
    // Normalize phone number: remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    // Use only the last 10 digits to avoid country code and formatting differences
    const normalized = digits.slice(-10);

    // Hash with SHA-256
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Verify phone number matches hash
   * @param phoneNumber - Phone number to verify
   * @param hash - Hash to compare against
   * @returns True if phone number matches hash
   */
  verifyPhoneNumber(phoneNumber: string, hash: string): boolean {
    const computedHash = this.hashPhoneNumber(phoneNumber);
    return computedHash === hash;
  }

  /**
   * Mask phone number for display (show last 4 digits only)
   * @param phoneNumber - Phone number to mask
   * @returns Masked phone number (e.g., "****1234")
   */
  maskPhoneNumber(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    const normalized = digits.slice(-10);
    if (normalized.length <= 4) {
      return '*'.repeat(normalized.length);
    }
    const lastFour = normalized.slice(-4);
    const maskedLength = normalized.length - 4;
    return '*'.repeat(maskedLength) + lastFour;
  }
}

// Singleton instance
export const hashingService = new HashingService();
