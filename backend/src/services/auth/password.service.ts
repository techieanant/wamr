import bcrypt from 'bcrypt';
import { logger } from '../../config/logger';

/**
 * bcrypt password hashing service
 * Uses cost factor 10 for balance between security and performance
 */
export class PasswordService {
  private readonly saltRounds = 10;

  /**
   * Hash password with bcrypt
   * @param password - Plain text password
   * @returns Bcrypt hash (60 characters starting with $2b$10$)
   */
  async hash(password: string): Promise<string> {
    try {
      const hash = await bcrypt.hash(password, this.saltRounds);
      return hash;
    } catch (error) {
      logger.error({ error }, 'Password hashing failed');
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify password against hash
   * @param password - Plain text password
   * @param hash - Bcrypt hash to compare against
   * @returns True if password matches hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error({ error }, 'Password verification failed');
      return false;
    }
  }

  /**
   * Validate password complexity
   * @param password - Password to validate
   * @returns True if password meets requirements
   */
  validateComplexity(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 4) {
      errors.push('Password must be at least 4 characters long');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
export const passwordService = new PasswordService();
