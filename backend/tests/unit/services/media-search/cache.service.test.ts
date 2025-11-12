import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheService } from '../../../../src/services/media-search/cache.service';
import type { NormalizedResult, MediaType } from '../../../../src/types/media-result.types';

// Mock logger
vi.mock('../../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CacheService', () => {
  let mockResult: NormalizedResult;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cacheService.clear(); // Start with clean cache

    mockResult = {
      title: 'Test Movie',
      year: 2023,
      mediaType: 'movie',
      tmdbId: 12345,
      overview: 'A test movie',
      posterPath: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      source: 'radarr',
      tvdbId: null,
      imdbId: null,
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('get', () => {
    it('should return null for cache miss', () => {
      const result = cacheService.get('movie', 'nonexistent query');
      expect(result).toBeNull();
    });

    it('should return cached results for cache hit', () => {
      const results = [mockResult];
      cacheService.set('movie', 'test query', results);

      const cached = cacheService.get('movie', 'test query');
      expect(cached).toEqual(results);
    });

    it('should return null for expired cache entry', () => {
      const results = [mockResult];
      // Set with very short TTL (1ms)
      cacheService.set('movie', 'test query', results, 1);

      // Wait for expiration
      vi.advanceTimersByTime(2);

      const cached = cacheService.get('movie', 'test query');
      expect(cached).toBeNull();
    });

    it('should normalize query for cache key generation', () => {
      const results = [mockResult];
      cacheService.set('movie', '  TEST   QUERY  ', results);

      // Should find with different whitespace/case
      const cached = cacheService.get('movie', 'test query');
      expect(cached).toEqual(results);
    });

    it('should handle different media types separately', () => {
      const movieResults = [{ ...mockResult, mediaType: 'movie' as const }];
      const seriesResults = [{ ...mockResult, mediaType: 'series' as const, title: 'Test Series' }];

      cacheService.set('movie', 'test query', movieResults);
      cacheService.set('series', 'test query', seriesResults);

      expect(cacheService.get('movie', 'test query')).toEqual(movieResults);
      expect(cacheService.get('series', 'test query')).toEqual(seriesResults);
    });
  });

  describe('set', () => {
    it('should store results with default TTL', () => {
      const results = [mockResult];
      cacheService.set('movie', 'test query', results);

      const cached = cacheService.get('movie', 'test query');
      expect(cached).toEqual(results);
    });

    it('should store results with custom TTL', () => {
      const results = [mockResult];
      const customTTL = 10000; // 10 seconds
      cacheService.set('movie', 'test query', results, customTTL);

      // Should still be valid after 5 seconds
      vi.advanceTimersByTime(5000);
      expect(cacheService.get('movie', 'test query')).toEqual(results);

      // Should expire after custom TTL
      vi.advanceTimersByTime(6000);
      expect(cacheService.get('movie', 'test query')).toBeNull();
    });

    it('should overwrite existing cache entry', () => {
      const oldResults = [{ ...mockResult, title: 'Old Title' }];
      const newResults = [{ ...mockResult, title: 'New Title' }];

      cacheService.set('movie', 'test query', oldResults);
      cacheService.set('movie', 'test query', newResults);

      const cached = cacheService.get('movie', 'test query');
      expect(cached).toEqual(newResults);
    });

    it('should handle empty results array', () => {
      cacheService.set('movie', 'empty query', []);

      const cached = cacheService.get('movie', 'empty query');
      expect(cached).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should return false for non-existent entry', () => {
      const deleted = cacheService.delete('movie', 'nonexistent');
      expect(deleted).toBe(false);
    });

    it('should delete existing entry and return true', () => {
      const results = [mockResult];
      cacheService.set('movie', 'test query', results);

      // Verify it exists
      expect(cacheService.get('movie', 'test query')).toEqual(results);

      // Delete it
      const deleted = cacheService.delete('movie', 'test query');
      expect(deleted).toBe(true);

      // Verify it's gone
      expect(cacheService.get('movie', 'test query')).toBeNull();
    });

    it('should delete expired entries when explicitly requested', () => {
      cacheService.set('movie', 'test query', [mockResult], 1);

      // Wait for expiration
      vi.advanceTimersByTime(2);

      // Try to delete expired entry - should succeed
      const deleted = cacheService.delete('movie', 'test query');
      expect(deleted).toBe(true);

      // Verify it's gone
      expect(cacheService.get('movie', 'test query')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cacheService.set('movie', 'query1', [mockResult]);
      cacheService.set('series', 'query2', [{ ...mockResult, mediaType: 'series' }]);

      // Verify entries exist
      expect(cacheService.get('movie', 'query1')).toBeTruthy();
      expect(cacheService.get('series', 'query2')).toBeTruthy();

      cacheService.clear();

      // Verify all entries are gone
      expect(cacheService.get('movie', 'query1')).toBeNull();
      expect(cacheService.get('series', 'query2')).toBeNull();
    });

    it('should reset statistics', () => {
      cacheService.set('movie', 'test', [mockResult]);
      cacheService.get('movie', 'test'); // Hit
      cacheService.get('movie', 'miss'); // Miss

      let stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);

      cacheService.clear();

      stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired entries', () => {
      cacheService.set('movie', 'fresh', [mockResult], 10000); // 10s TTL
      cacheService.set('movie', 'expired', [mockResult], 1); // 1ms TTL

      // Wait for one entry to expire
      vi.advanceTimersByTime(2);

      const removed = cacheService.cleanupExpired();
      expect(removed).toBe(1);

      // Fresh entry should still exist
      expect(cacheService.get('movie', 'fresh')).toBeTruthy();
      // Expired entry should be gone
      expect(cacheService.get('movie', 'expired')).toBeNull();
    });

    it('should return 0 when no expired entries', () => {
      cacheService.set('movie', 'fresh', [mockResult]);

      const removed = cacheService.cleanupExpired();
      expect(removed).toBe(0);
      expect(cacheService.get('movie', 'fresh')).toBeTruthy();
    });

    it('should handle empty cache', () => {
      const removed = cacheService.cleanupExpired();
      expect(removed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      // Initial state
      let stats = cacheService.getStats();
      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        entries: 0,
        hitRate: 0,
      });

      // Add some entries
      cacheService.set('movie', 'query1', [mockResult]);
      cacheService.set('series', 'query2', [{ ...mockResult, mediaType: 'series' }]);

      // Generate hits and misses
      cacheService.get('movie', 'query1'); // Hit
      cacheService.get('movie', 'query1'); // Hit
      cacheService.get('movie', 'miss1'); // Miss
      cacheService.get('series', 'query2'); // Hit
      cacheService.get('series', 'miss2'); // Miss

      stats = cacheService.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.entries).toBe(2);
      expect(stats.hitRate).toBe(0.6); // 3/5
    });

    it('should calculate hit rate correctly with no requests', () => {
      const stats = cacheService.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('has', () => {
    it('should return false for non-existent entry', () => {
      expect(cacheService.has('movie', 'nonexistent')).toBe(false);
    });

    it('should return true for existing valid entry', () => {
      cacheService.set('movie', 'test query', [mockResult]);
      expect(cacheService.has('movie', 'test query')).toBe(true);
    });

    it('should return false for expired entry and clean it up', () => {
      cacheService.set('movie', 'expired', [mockResult], 1);

      vi.advanceTimersByTime(2);

      expect(cacheService.has('movie', 'expired')).toBe(false);
      // Should be cleaned up
      expect(cacheService.get('movie', 'expired')).toBeNull();
    });
  });

  describe('getTimeRemaining', () => {
    it('should return null for non-existent entry', () => {
      expect(cacheService.getTimeRemaining('movie', 'nonexistent')).toBeNull();
    });

    it('should return remaining time for valid entry', () => {
      cacheService.set('movie', 'test', [mockResult], 10000);

      const remaining = cacheService.getTimeRemaining('movie', 'test');
      expect(remaining).toBeGreaterThan(9000); // Should be close to 10000
      expect(remaining).toBeLessThanOrEqual(10000);
    });

    it('should return null for expired entry and clean it up', () => {
      cacheService.set('movie', 'expired', [mockResult], 1);

      vi.advanceTimersByTime(2);

      expect(cacheService.getTimeRemaining('movie', 'expired')).toBeNull();
      expect(cacheService.get('movie', 'expired')).toBeNull();
    });
  });

  describe('extend', () => {
    it('should return false for non-existent entry', () => {
      const extended = cacheService.extend('movie', 'nonexistent');
      expect(extended).toBe(false);
    });

    it('should extend TTL for existing entry', () => {
      cacheService.set('movie', 'test', [mockResult], 1000);

      // Get initial remaining time
      const initialRemaining = cacheService.getTimeRemaining('movie', 'test');
      expect(initialRemaining).toBeGreaterThan(500);

      // Extend by 2000ms
      const extended = cacheService.extend('movie', 'test', 2000);
      expect(extended).toBe(true);

      // Check new remaining time
      const newRemaining = cacheService.getTimeRemaining('movie', 'test');
      expect(newRemaining).toBeGreaterThan(initialRemaining! + 1500);
    });

    it('should return false for expired entry', () => {
      cacheService.set('movie', 'expired', [mockResult], 1);

      vi.advanceTimersByTime(2);

      const extended = cacheService.extend('movie', 'expired');
      expect(extended).toBe(false);
    });

    it('should use default TTL when no additional TTL provided', () => {
      cacheService.set('movie', 'test', [mockResult], 1000);

      const initialRemaining = cacheService.getTimeRemaining('movie', 'test');

      // Extend with default TTL (5 minutes)
      cacheService.extend('movie', 'test');

      const newRemaining = cacheService.getTimeRemaining('movie', 'test');
      expect(newRemaining).toBeGreaterThan(initialRemaining! + 299000); // ~5 minutes
    });
  });

  describe('getKeys', () => {
    it('should return empty array for empty cache', () => {
      expect(cacheService.getKeys()).toEqual([]);
    });

    it('should return all cache keys', () => {
      cacheService.set('movie', 'query1', [mockResult]);
      cacheService.set('series', 'query2', [{ ...mockResult, mediaType: 'series' }]);

      const keys = cacheService.getKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('movie:query1');
      expect(keys).toContain('series:query2');
    });
  });

  describe('getEntry', () => {
    it('should return null for non-existent entry', () => {
      expect(cacheService.getEntry('movie', 'nonexistent')).toBeNull();
    });

    it('should return cache entry details', () => {
      const results = [mockResult];
      cacheService.set('movie', 'test query', results, 10000);

      const entry = cacheService.getEntry('movie', 'test query');
      expect(entry).toBeTruthy();
      expect(entry!.key).toBe('movie:test query');
      expect(entry!.results).toEqual(results);
      expect(entry!.expiresAt).toBeInstanceOf(Date);
      expect(entry!.createdAt).toBeInstanceOf(Date);
      expect(entry!.expiresAt.getTime()).toBeGreaterThan(entry!.createdAt.getTime());
    });
  });

  describe('getDefaultTTL', () => {
    it('should return the default TTL', () => {
      const defaultTTL = cacheService.getDefaultTTL();
      expect(defaultTTL).toBe(5 * 60 * 1000); // 5 minutes in milliseconds
    });
  });
});
