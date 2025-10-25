/**
 * Cache Service
 *
 * In-memory cache for media search results with TTL (Time To Live).
 * Reduces duplicate API calls and improves response time for repeated searches.
 */

import { logger } from '../../config/logger';
import type { NormalizedResult, MediaType } from '../../types/media-result.types';

/**
 * Cache entry structure
 */
interface CacheEntry {
  key: string;
  results: NormalizedResult[];
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
}

/**
 * Service for caching media search results
 */
class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private hits = 0;
  private misses = 0;

  /**
   * Generate cache key from search parameters
   */
  private generateKey(mediaType: MediaType, query: string): string {
    // Normalize query: lowercase, trim, remove extra spaces
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `${mediaType}:${normalizedQuery}`;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }

  /**
   * Get results from cache
   * Returns null if not found or expired
   */
  get(mediaType: MediaType, query: string): NormalizedResult[] | null {
    const key = this.generateKey(mediaType, query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      logger.debug('Cache miss', { key, mediaType, query });
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      logger.debug('Cache entry expired', {
        key,
        mediaType,
        query,
        age: Date.now() - entry.createdAt.getTime(),
      });
      return null;
    }

    // Cache hit
    this.hits++;
    logger.debug('Cache hit', {
      key,
      mediaType,
      query,
      resultCount: entry.results.length,
      age: Date.now() - entry.createdAt.getTime(),
    });

    return entry.results;
  }

  /**
   * Store results in cache
   */
  set(
    mediaType: MediaType,
    query: string,
    results: NormalizedResult[],
    ttl: number = this.defaultTTL
  ): void {
    const key = this.generateKey(mediaType, query);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl);

    const entry: CacheEntry = {
      key,
      results,
      expiresAt,
      createdAt: now,
    };

    this.cache.set(key, entry);

    logger.debug('Cache entry stored', {
      key,
      mediaType,
      query,
      resultCount: results.length,
      ttl,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /**
   * Remove specific cache entry
   */
  delete(mediaType: MediaType, query: string): boolean {
    const key = this.generateKey(mediaType, query);
    const deleted = this.cache.delete(key);

    if (deleted) {
      logger.debug('Cache entry deleted', { key, mediaType, query });
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;

    logger.info('Cache cleared', { entriesRemoved: count });
  }

  /**
   * Clean up expired cache entries
   * Should be called periodically (e.g., every minute)
   */
  cleanupExpired(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Expired cache entries cleaned up', {
        removed,
        remaining: this.cache.size,
      });
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entry details (for debugging)
   */
  getEntry(mediaType: MediaType, query: string): CacheEntry | null {
    const key = this.generateKey(mediaType, query);
    return this.cache.get(key) || null;
  }

  /**
   * Check if cache has valid entry for query
   */
  has(mediaType: MediaType, query: string): boolean {
    const key = this.generateKey(mediaType, query);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get time remaining until cache entry expires (in milliseconds)
   * Returns null if not found or already expired
   */
  getTimeRemaining(mediaType: MediaType, query: string): number | null {
    const key = this.generateKey(mediaType, query);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry.expiresAt.getTime() - Date.now();
  }

  /**
   * Extend TTL for existing cache entry
   * Returns true if entry was found and extended, false otherwise
   */
  extend(mediaType: MediaType, query: string, additionalTTL: number = this.defaultTTL): boolean {
    const key = this.generateKey(mediaType, query);
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if already expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    // Extend expiration time
    entry.expiresAt = new Date(entry.expiresAt.getTime() + additionalTTL);

    logger.debug('Cache entry TTL extended', {
      key,
      mediaType,
      query,
      newExpiresAt: entry.expiresAt.toISOString(),
    });

    return true;
  }

  /**
   * Get default TTL in milliseconds
   */
  getDefaultTTL(): number {
    return this.defaultTTL;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
