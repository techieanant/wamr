/**
 * Result Normalizer Service
 *
 * Normalizes search results from different media services (Radarr, Sonarr, Overseerr)
 * into a unified format for consistent handling throughout the application.
 */

import { logger } from '../../config/logger';
import type {
  NormalizedResult,
  RadarrMovieResult,
  SonarrSeriesResult,
  OverseerrSearchResult,
  ServiceType,
} from '../../types/media-result.types';
import {
  normalizeRadarrResult,
  normalizeSonarrResult,
  normalizeOverseerrResult,
  deduplicateResults,
  sortResultsByYear,
  limitResults,
} from '../../types/media-result.types';

/**
 * Service for normalizing and processing media search results
 */
class ResultNormalizerService {
  /**
   * Normalize Radarr movie search results
   */
  normalizeRadarrResults(
    results: RadarrMovieResult[],
    source: ServiceType = 'radarr'
  ): NormalizedResult[] {
    try {
      logger.debug('Normalizing Radarr results', {
        count: results.length,
        source,
      });

      const normalized = results.map((result) => {
        try {
          return normalizeRadarrResult(result, source);
        } catch (error) {
          logger.warn('Failed to normalize Radarr result', {
            error,
            result,
          });
          return null;
        }
      });

      // Filter out failed normalizations
      const valid = normalized.filter((r): r is NormalizedResult => r !== null);

      logger.debug('Radarr normalization complete', {
        input: results.length,
        output: valid.length,
        filtered: results.length - valid.length,
      });

      return valid;
    } catch (error) {
      logger.error('Error normalizing Radarr results', { error });
      return [];
    }
  }

  /**
   * Normalize Sonarr series search results
   */
  normalizeSonarrResults(
    results: SonarrSeriesResult[],
    source: ServiceType = 'sonarr'
  ): NormalizedResult[] {
    try {
      logger.debug('Normalizing Sonarr results', {
        count: results.length,
        source,
      });

      const normalized = results.map((result) => {
        try {
          return normalizeSonarrResult(result, source);
        } catch (error) {
          logger.warn('Failed to normalize Sonarr result', {
            error,
            result,
          });
          return null;
        }
      });

      // Filter out failed normalizations
      const valid = normalized.filter((r): r is NormalizedResult => r !== null);

      logger.debug('Sonarr normalization complete', {
        input: results.length,
        output: valid.length,
        filtered: results.length - valid.length,
      });

      return valid;
    } catch (error) {
      logger.error('Error normalizing Sonarr results', { error });
      return [];
    }
  }

  /**
   * Normalize Overseerr search results
   */
  normalizeOverseerrResults(
    results: OverseerrSearchResult[],
    source: ServiceType = 'overseerr'
  ): NormalizedResult[] {
    try {
      logger.debug('Normalizing Overseerr results', {
        count: results.length,
        source,
      });

      const normalized = results.map((result) => {
        try {
          return normalizeOverseerrResult(result, source);
        } catch (error) {
          logger.warn('Failed to normalize Overseerr result', {
            error,
            result,
          });
          return null;
        }
      });

      // Filter out failed normalizations
      const valid = normalized.filter((r): r is NormalizedResult => r !== null);

      logger.debug('Overseerr normalization complete', {
        input: results.length,
        output: valid.length,
        filtered: results.length - valid.length,
      });

      return valid;
    } catch (error) {
      logger.error('Error normalizing Overseerr results', { error });
      return [];
    }
  }

  /**
   * Process and deduplicate search results from multiple sources
   * Returns up to maxResults unique results, sorted by year (most recent first)
   */
  processResults(results: NormalizedResult[], maxResults: number = 5): NormalizedResult[] {
    try {
      logger.debug('Processing search results', {
        inputCount: results.length,
        maxResults,
      });

      // Step 1: Deduplicate results
      const deduplicated = deduplicateResults(results);
      logger.debug('Deduplication complete', {
        input: results.length,
        output: deduplicated.length,
        removed: results.length - deduplicated.length,
      });

      // Step 2: Sort by year (most recent first)
      const sorted = sortResultsByYear(deduplicated);

      // Step 3: Limit to max results
      const limited = limitResults(sorted, maxResults);

      logger.debug('Result processing complete', {
        finalCount: limited.length,
      });

      return limited;
    } catch (error) {
      logger.error('Error processing results', { error });
      return [];
    }
  }

  /**
   * Combine and process results from multiple sources
   * Normalizes, deduplicates, sorts, and limits results in one operation
   */
  combineAndProcess(
    radarrResults: RadarrMovieResult[] = [],
    sonarrResults: SonarrSeriesResult[] = [],
    overseerrResults: OverseerrSearchResult[] = [],
    maxResults: number = 5
  ): NormalizedResult[] {
    try {
      logger.debug('Combining results from multiple sources', {
        radarr: radarrResults.length,
        sonarr: sonarrResults.length,
        overseerr: overseerrResults.length,
      });

      // Normalize results from each source
      const normalizedRadarr = this.normalizeRadarrResults(radarrResults);
      const normalizedSonarr = this.normalizeSonarrResults(sonarrResults);
      const normalizedOverseerr = this.normalizeOverseerrResults(overseerrResults);

      // Combine all normalized results
      const combined = [...normalizedRadarr, ...normalizedSonarr, ...normalizedOverseerr];

      logger.debug('Normalization complete', {
        total: combined.length,
      });

      // Process combined results (deduplicate, sort, limit)
      return this.processResults(combined, maxResults);
    } catch (error) {
      logger.error('Error combining and processing results', { error });
      return [];
    }
  }

  /**
   * Validate that a normalized result has required fields
   */
  isValidResult(result: NormalizedResult): boolean {
    return !!(
      result.title &&
      result.mediaType &&
      (result.tmdbId || result.tvdbId || (result.title && result.year))
    );
  }

  /**
   * Filter out invalid results
   */
  filterValidResults(results: NormalizedResult[]): NormalizedResult[] {
    const valid = results.filter((r) => this.isValidResult(r));

    if (valid.length < results.length) {
      logger.warn('Filtered out invalid results', {
        input: results.length,
        output: valid.length,
        filtered: results.length - valid.length,
      });
    }

    return valid;
  }
}

// Export singleton instance
export const resultNormalizerService = new ResultNormalizerService();
