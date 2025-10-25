import { logger } from '../../config/logger';

/**
 * Rate limit bucket for tracking attempts
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter service for tracking and limiting requests
 * In-memory implementation (consider Redis for production with multiple instances)
 */
export class RateLimiterService {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired buckets every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Check if request is allowed
   * @param key - Unique identifier (IP, phone number, etc.)
   * @param maxAttempts - Maximum attempts allowed
   * @param windowMs - Time window in milliseconds
   * @returns True if request is allowed
   */
  isAllowed(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    // No bucket exists or bucket expired - allow request
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    // Bucket exists and not expired - check count
    if (bucket.count < maxAttempts) {
      bucket.count++;
      return true;
    }

    // Rate limit exceeded
    logger.warn({ key, maxAttempts, windowMs }, 'Rate limit exceeded');
    return false;
  }

  /**
   * Get remaining attempts
   * @param key - Unique identifier
   * @param maxAttempts - Maximum attempts allowed
   * @returns Remaining attempts or null if no bucket exists
   */
  getRemaining(key: string, maxAttempts: number): number | null {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() >= bucket.resetAt) {
      return maxAttempts;
    }
    return Math.max(0, maxAttempts - bucket.count);
  }

  /**
   * Get time until reset
   * @param key - Unique identifier
   * @returns Milliseconds until reset or null if no bucket exists
   */
  getResetTime(key: string): number | null {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return null;
    }
    return Math.max(0, bucket.resetAt - Date.now());
  }

  /**
   * Reset bucket for key
   * @param key - Unique identifier
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Cleanup expired buckets
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up expired rate limit buckets');
    }
  }

  /**
   * Destroy rate limiter (clear interval)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

// Singleton instance
export const rateLimiterService = new RateLimiterService();
