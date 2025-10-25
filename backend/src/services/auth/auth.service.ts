import jwt from 'jsonwebtoken';
import { env } from '../../config/environment';
import { logger } from '../../config/logger';

/**
 * JWT token payload
 */
export interface TokenPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT authentication service
 * Handles token generation and validation
 */
export class AuthService {
  private readonly secret: string;
  private readonly expiresIn = '24h';

  constructor() {
    this.secret = env.JWT_SECRET;
  }

  /**
   * Generate JWT token
   * @param payload - Token payload (userId, username)
   * @returns JWT token string
   */
  generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    try {
      return jwt.sign(payload, this.secret, {
        expiresIn: this.expiresIn,
      });
    } catch (error) {
      logger.error({ error }, 'Token generation failed');
      throw new Error('Failed to generate token');
    }
  }

  /**
   * Verify JWT token
   * @param token - JWT token string
   * @returns Decoded token payload or null if invalid
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('Invalid token');
      } else {
        logger.error({ error }, 'Token verification failed');
      }
      return null;
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param token - JWT token string
   * @returns Decoded token payload or null
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      return jwt.decode(token) as TokenPayload;
    } catch (error) {
      logger.error({ error }, 'Token decoding failed');
      return null;
    }
  }

  /**
   * Check if token is expired
   * @param token - JWT token string
   * @returns True if token is expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return Date.now() >= decoded.exp * 1000;
  }
}

// Singleton instance
export const authService = new AuthService();
