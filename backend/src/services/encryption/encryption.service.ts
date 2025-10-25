import crypto from 'crypto';
import { env } from '../../config/environment';
import { logger } from '../../config/logger';

/**
 * AES-256-GCM encryption service for sensitive data (API keys)
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyBuffer: Buffer;

  constructor() {
    // Convert hex key to buffer (64 hex chars = 32 bytes)
    this.keyBuffer = Buffer.from(env.ENCRYPTION_KEY, 'hex');

    if (this.keyBuffer.length !== 32) {
      throw new Error('Invalid ENCRYPTION_KEY: must be 64 hex characters (32 bytes)');
    }
  }

  /**
   * Encrypt plaintext data
   * @param plaintext - Data to encrypt
   * @returns Encrypted string in format "iv:authTag:ciphertext"
   */
  encrypt(plaintext: string): string {
    try {
      // Generate random IV (12 bytes recommended for GCM)
      const iv = crypto.randomBytes(12);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.keyBuffer, iv);

      // Encrypt data
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get auth tag (16 bytes)
      const authTag = cipher.getAuthTag();

      // Return formatted string: iv:authTag:ciphertext
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
    } catch (error) {
      logger.error({ error }, 'Encryption failed');
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt encrypted data
   * @param encrypted - Encrypted string in format "iv:authTag:ciphertext"
   * @returns Decrypted plaintext
   */
  decrypt(encrypted: string): string {
    try {
      // Parse encrypted string
      const parts = encrypted.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      const [ivHex, authTagHex, ciphertext] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.keyBuffer, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      logger.error({ error }, 'Decryption failed');
      throw new Error('Failed to decrypt data');
    }
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
