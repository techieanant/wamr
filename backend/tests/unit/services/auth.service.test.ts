import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService, TokenPayload } from '../../../src/services/auth/auth.service';

// Mock the logger
vi.mock('../../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock environment
vi.mock('../../src/config/environment', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret',
  },
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = { userId: 1, username: 'testuser' };
      const token = authService.generateToken(payload);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should include correct payload in token', () => {
      const payload = { userId: 123, username: 'admin' };
      const token = authService.generateToken(payload);

      const decoded = authService.verifyToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded!.userId).toBe(123);
      expect(decoded!.username).toBe('admin');
    });

    it('should handle token generation errors', () => {
      // Mock jwt.sign to throw an error
      const jwt = require('jsonwebtoken');
      const originalSign = jwt.sign;
      jwt.sign = vi.fn().mockImplementation(() => {
        throw new Error('Signing failed');
      });

      expect(() => {
        authService.generateToken({ userId: 1, username: 'test' });
      }).toThrow('Failed to generate token');

      jwt.sign = originalSign;
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = { userId: 1, username: 'testuser' };
      const token = authService.generateToken(payload);

      const decoded = authService.verifyToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded!.userId).toBe(1);
      expect(decoded!.username).toBe('testuser');
    });

    it('should return null for invalid token', () => {
      const result = authService.verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      // Create a token that expires immediately
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign({ userId: 1, username: 'test' }, 'test-jwt-secret', {
        expiresIn: '-1h',
      });

      const result = authService.verifyToken(expiredToken);
      expect(result).toBeNull();
    });

    it('should handle verification errors gracefully', () => {
      const jwt = require('jsonwebtoken');
      const originalVerify = jwt.verify;
      jwt.verify = vi.fn().mockImplementation(() => {
        throw new Error('Verification failed');
      });

      const result = authService.verifyToken('some-token');
      expect(result).toBeNull();

      jwt.verify = originalVerify;
    });
  });

  describe('decodeToken', () => {
    it('should decode a valid token without verification', () => {
      const payload = { userId: 1, username: 'testuser' };
      const token = authService.generateToken(payload);

      const decoded = authService.decodeToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded!.userId).toBe(1);
      expect(decoded!.username).toBe('testuser');
    });

    it('should return null for invalid token', () => {
      const result = authService.decodeToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should handle decode errors', () => {
      const jwt = require('jsonwebtoken');
      const originalDecode = jwt.decode;
      jwt.decode = vi.fn().mockImplementation(() => {
        throw new Error('Decode failed');
      });

      const result = authService.decodeToken('some-token');
      expect(result).toBeNull();

      jwt.decode = originalDecode;
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid non-expired token', () => {
      const payload = { userId: 1, username: 'testuser' };
      const token = authService.generateToken(payload);

      const isExpired = authService.isTokenExpired(token);
      expect(isExpired).toBe(false);
    });

    it('should return true for expired token', () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 1, username: 'test', exp: Math.floor(Date.now() / 1000) - 3600 },
        'test-jwt-secret'
      );

      const isExpired = authService.isTokenExpired(expiredToken);
      expect(isExpired).toBe(true);
    });

    it('should return true for invalid token', () => {
      const isExpired = authService.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });
  });
});
