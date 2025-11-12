import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiterService } from '../../../src/services/auth/rate-limiter.service';

// Mock the logger
vi.mock('../../../src/config/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter = new RateLimiterService();
  });

  afterEach(() => {
    rateLimiter.destroy();
  });

  describe('isAllowed', () => {
    it('should allow first request', () => {
      const result = rateLimiter.isAllowed('test-key', 3, 60000);
      expect(result).toBe(true);
    });

    it('should allow requests within limit', () => {
      rateLimiter.isAllowed('test-key', 3, 60000);
      rateLimiter.isAllowed('test-key', 3, 60000);
      const result = rateLimiter.isAllowed('test-key', 3, 60000);
      expect(result).toBe(true);
    });

    it('should deny requests over limit', () => {
      rateLimiter.isAllowed('test-key', 2, 60000);
      rateLimiter.isAllowed('test-key', 2, 60000);
      const result = rateLimiter.isAllowed('test-key', 2, 60000);
      expect(result).toBe(false);
    });

    it('should allow requests after window expires', () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      let mockTime = 1000;

      global.Date.now = vi.fn(() => mockTime);

      // First request
      rateLimiter.isAllowed('test-key', 1, 2000);
      expect(rateLimiter.isAllowed('test-key', 1, 2000)).toBe(false);

      // Advance time past window
      mockTime = 4000;
      const result = rateLimiter.isAllowed('test-key', 1, 2000);
      expect(result).toBe(true);

      global.Date.now = originalNow;
    });

    it('should handle different keys independently', () => {
      rateLimiter.isAllowed('key1', 1, 60000);
      rateLimiter.isAllowed('key2', 1, 60000);

      expect(rateLimiter.isAllowed('key1', 1, 60000)).toBe(false);
      expect(rateLimiter.isAllowed('key2', 1, 60000)).toBe(false);
    });
  });

  describe('getRemaining', () => {
    it('should return max attempts for new key', () => {
      const remaining = rateLimiter.getRemaining('new-key', 5);
      expect(remaining).toBe(5);
    });

    it('should return remaining attempts', () => {
      rateLimiter.isAllowed('test-key', 5, 60000);
      rateLimiter.isAllowed('test-key', 5, 60000);

      const remaining = rateLimiter.getRemaining('test-key', 5);
      expect(remaining).toBe(3);
    });

    it('should return 0 when limit reached', () => {
      rateLimiter.isAllowed('test-key', 2, 60000);
      rateLimiter.isAllowed('test-key', 2, 60000);

      const remaining = rateLimiter.getRemaining('test-key', 2);
      expect(remaining).toBe(0);
    });

    it('should return max attempts after window expires', () => {
      const originalNow = Date.now;
      let mockTime = 1000;

      global.Date.now = vi.fn(() => mockTime);

      rateLimiter.isAllowed('test-key', 1, 2000);
      mockTime = 4000; // Past window

      const remaining = rateLimiter.getRemaining('test-key', 1);
      expect(remaining).toBe(1);

      global.Date.now = originalNow;
    });
  });

  describe('getResetTime', () => {
    it('should return null for non-existent key', () => {
      const resetTime = rateLimiter.getResetTime('non-existent');
      expect(resetTime).toBeNull();
    });

    it('should return time until reset', () => {
      const originalNow = Date.now;
      let mockTime = 1000;

      global.Date.now = vi.fn(() => mockTime);

      rateLimiter.isAllowed('test-key', 1, 5000);
      const resetTime = rateLimiter.getResetTime('test-key');

      expect(resetTime).toBe(5000);

      global.Date.now = originalNow;
    });

    it('should return 0 when window has expired', () => {
      const originalNow = Date.now;
      let mockTime = 1000;

      global.Date.now = vi.fn(() => mockTime);

      rateLimiter.isAllowed('test-key', 1, 2000);
      mockTime = 4000; // Past reset time

      const resetTime = rateLimiter.getResetTime('test-key');
      expect(resetTime).toBe(0);

      global.Date.now = originalNow;
    });
  });

  describe('reset', () => {
    it('should reset bucket for key', () => {
      rateLimiter.isAllowed('test-key', 1, 60000);
      expect(rateLimiter.isAllowed('test-key', 1, 60000)).toBe(false);

      rateLimiter.reset('test-key');
      expect(rateLimiter.isAllowed('test-key', 1, 60000)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired buckets', () => {
      const originalNow = Date.now;
      let mockTime = 1000;

      global.Date.now = vi.fn(() => mockTime);

      // Create buckets
      rateLimiter.isAllowed('key1', 1, 2000); // Expires at 3000
      rateLimiter.isAllowed('key2', 1, 4000); // Expires at 5000

      // Advance time past first bucket's expiry
      mockTime = 3500;

      // Trigger cleanup (normally done by interval)
      (rateLimiter as any).cleanup();

      // key1 should be cleaned up, key2 should remain
      expect(rateLimiter.getResetTime('key1')).toBeNull();
      expect(rateLimiter.getResetTime('key2')).toBeGreaterThan(0);

      global.Date.now = originalNow;
    });
  });
});
