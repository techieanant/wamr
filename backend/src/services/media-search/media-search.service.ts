/**
 * Media Search Service
 *
 * Orchestrates parallel searches across Radarr, Sonarr, and Overseerr.
 * Implements timeout handling, result normalization, deduplication, and caching.
 */

import { logger } from '../../config/logger';
import type { MediaType, NormalizedResult } from '../../types/media-result.types';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository';
import { encryptionService } from '../encryption/encryption.service';
import { RadarrClient } from '../integrations/radarr.client';
import { SonarrClient } from '../integrations/sonarr.client';
import { OverseerrClient } from '../integrations/overseerr.client';
import { resultNormalizerService } from './result-normalizer';
import { cacheService, type CacheStats } from './cache.service';

/**
 * Search result with service information
 */
export interface MediaSearchResult {
  results: NormalizedResult[];
  searchedServices: string[];
  failedServices: string[];
  fromCache: boolean;
  searchDuration: number;
}

/**
 * Service for searching media across multiple sources
 */
class MediaSearchService {
  private readonly searchTimeout = 8000; // 8 seconds per service (axios has 9s timeout)

  /**
   * Search for media across all enabled services
   * When mediaType is 'movie' but query is ambiguous (no explicit keywords),
   * search both movies AND TV series
   */
  async search(
    mediaType: MediaType,
    query: string,
    searchBoth: boolean = true
  ): Promise<MediaSearchResult> {
    const startTime = Date.now();

    // Check cache first (try both movie and series cache for comprehensive search)
    if (searchBoth) {
      const movieCache = cacheService.get('movie', query);
      const seriesCache = cacheService.get('series', query);

      if (movieCache && seriesCache) {
        const combined = [...movieCache, ...seriesCache];
        logger.info('Returning cached search results (both types)', {
          query,
          resultCount: combined.length,
        });

        return {
          results: combined,
          searchedServices: [],
          failedServices: [],
          fromCache: true,
          searchDuration: Date.now() - startTime,
        };
      }
    } else {
      const cachedResults = cacheService.get(mediaType, query);
      if (cachedResults) {
        logger.info('Returning cached search results', {
          mediaType,
          query,
          resultCount: cachedResults.length,
        });

        return {
          results: cachedResults,
          searchedServices: [],
          failedServices: [],
          fromCache: true,
          searchDuration: Date.now() - startTime,
        };
      }
    }

    // Determine which services to search
    let servicesToSearch: string[];
    if (searchBoth) {
      // Search all services when ambiguous
      servicesToSearch = ['radarr', 'sonarr', 'overseerr'];
      logger.info('Starting comprehensive media search (movies + series)', {
        query,
        services: servicesToSearch,
      });
    } else {
      // Search specific services based on media type
      servicesToSearch = mediaType === 'movie' ? ['radarr', 'overseerr'] : ['sonarr', 'overseerr'];
      logger.info('Starting media search', {
        mediaType,
        query,
        services: servicesToSearch,
      });
    }

    // Get maxResults from service configs (use the maximum across all enabled services)
    const allConfigs = await mediaServiceConfigRepository.findAll();
    const enabledConfigs = allConfigs.filter((c) => c.enabled);
    const maxResults =
      enabledConfigs.length > 0 ? Math.max(...enabledConfigs.map((c) => c.maxResults)) : 5;

    // When searching both types, always use 'both' as the effective media type for filtering
    const effectiveMediaType = searchBoth ? 'both' : mediaType;

    logger.debug('Search parameters', {
      query,
      originalMediaType: mediaType,
      searchBoth,
      effectiveMediaType,
      servicesToSearch,
    });

    // Search all services in parallel with timeout
    const searchPromises = servicesToSearch.map((serviceType) =>
      this.searchService(
        serviceType as 'radarr' | 'sonarr' | 'overseerr',
        query,
        effectiveMediaType
      )
    );

    const results = await Promise.allSettled(searchPromises);

    // Process results
    const searchedServices: string[] = [];
    const failedServices: string[] = [];
    let radarrResults: any[] = [];
    let sonarrResults: any[] = [];
    let overseerrResults: any[] = [];

    results.forEach((result, index) => {
      const serviceType = servicesToSearch[index];

      if (result.status === 'fulfilled' && result.value) {
        searchedServices.push(serviceType);

        if (serviceType === 'radarr') {
          radarrResults = result.value;
        } else if (serviceType === 'sonarr') {
          sonarrResults = result.value;
        } else if (serviceType === 'overseerr') {
          overseerrResults = result.value;
        }
      } else {
        failedServices.push(serviceType);
        logger.warn('Service search failed', {
          service: serviceType,
          error: result.status === 'rejected' ? result.reason : 'Unknown error',
        });
      }
    });

    // Normalize and combine results
    const normalizedResults = resultNormalizerService.combineAndProcess(
      radarrResults,
      sonarrResults,
      overseerrResults,
      maxResults // Use dynamic limit from service config
    );

    // Cache results for 5 minutes
    if (normalizedResults.length > 0) {
      cacheService.set(mediaType, query, normalizedResults);
    }

    const searchDuration = Date.now() - startTime;

    logger.info('Media search completed', {
      mediaType,
      query,
      resultCount: normalizedResults.length,
      searchedServices,
      failedServices,
      duration: searchDuration,
    });

    return {
      results: normalizedResults,
      searchedServices,
      failedServices,
      fromCache: false,
      searchDuration,
    };
  }

  /**
   * Search a specific service with timeout
   */
  private async searchService(
    serviceType: 'radarr' | 'sonarr' | 'overseerr',
    query: string,
    mediaType: MediaType
  ): Promise<any[]> {
    try {
      // Get enabled services of this type, ordered by priority
      const configs = await mediaServiceConfigRepository.findEnabledByType(serviceType);

      if (configs.length === 0) {
        logger.debug('No enabled services found', { serviceType });
        return [];
      }

      // Use highest priority service (first in array)
      const config = configs[0];

      logger.debug('Searching service', {
        serviceType,
        serviceName: config.name,
        serviceId: config.id,
        baseUrl: config.baseUrl,
        query,
        mediaType,
      });

      // Decrypt API key
      const apiKey = encryptionService.decrypt(config.apiKeyEncrypted);

      // Create client and search with timeout
      const searchPromise = this.executeSearch(
        serviceType,
        config.baseUrl,
        apiKey,
        query,
        mediaType
      );

      const timeoutPromise = new Promise<any[]>((_, reject) => {
        setTimeout(() => reject(new Error('Search timeout')), this.searchTimeout);
      });

      const results = await Promise.race([searchPromise, timeoutPromise]);

      logger.debug('Service search completed', {
        serviceType,
        serviceName: config.name,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      // Determine error type for better debugging
      const isTimeout = error instanceof Error && error.message === 'Search timeout';
      const errorDetails: any = {
        serviceType,
        query,
        mediaType,
        errorType: isTimeout ? 'TIMEOUT' : 'UNKNOWN',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };

      // Add axios-specific error details if available
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        errorDetails.errorType = 'API_ERROR';
        errorDetails.httpStatus = axiosError.response?.status;
        errorDetails.httpStatusText = axiosError.response?.statusText;
        errorDetails.responseData = axiosError.response?.data;
        errorDetails.requestUrl = axiosError.config?.url;
        errorDetails.requestMethod = axiosError.config?.method;
      } else if (error && typeof error === 'object' && 'request' in error) {
        errorDetails.errorType = 'NETWORK_ERROR';
        errorDetails.code = (error as any).code;
      }

      logger.error('Service search error', errorDetails);

      // Return empty array instead of throwing to allow other services to provide results
      return [];
    }
  }

  /**
   * Execute search against specific service client
   */
  private async executeSearch(
    serviceType: 'radarr' | 'sonarr' | 'overseerr',
    baseUrl: string,
    apiKey: string,
    query: string,
    mediaType: MediaType
  ): Promise<any[]> {
    switch (serviceType) {
      case 'radarr': {
        const client = new RadarrClient(baseUrl, apiKey);
        return await client.searchMovies(query);
      }

      case 'sonarr': {
        const client = new SonarrClient(baseUrl, apiKey);
        return await client.searchSeries(query);
      }

      case 'overseerr': {
        const client = new OverseerrClient(baseUrl, apiKey);
        const searchResult = await client.search(query);

        logger.debug('Overseerr search results before filtering', {
          query,
          mediaType,
          totalResults: searchResult.results.length,
          resultTypes: searchResult.results.map((r) => r.mediaType),
        });

        // Filter Overseerr results by media type
        const filtered = searchResult.results.filter((result) => {
          if (mediaType === 'movie') {
            return result.mediaType === 'movie';
          } else if (mediaType === 'series') {
            return result.mediaType === 'tv';
          } else {
            // mediaType === 'both' - return all results
            return true;
          }
        });

        logger.debug('Overseerr search results after filtering', {
          query,
          mediaType,
          filteredCount: filtered.length,
          filteredTypes: filtered.map((r) => r.mediaType),
        });

        return filtered;
      }

      default:
        throw new Error(`Unsupported service type: ${serviceType}`);
    }
  }

  /**
   * Get highest priority enabled service for media type
   */
  async getHighestPriorityService(
    mediaType: MediaType
  ): Promise<{ serviceType: string; serviceConfigId: number } | null> {
    try {
      // For movies: check radarr first, then overseerr
      // For series: check sonarr first, then overseerr
      const primaryService = mediaType === 'movie' ? 'radarr' : 'sonarr';
      const fallbackService = 'overseerr';

      // Check primary service
      const primaryConfigs = await mediaServiceConfigRepository.findEnabledByType(primaryService);
      if (primaryConfigs.length > 0) {
        return {
          serviceType: primaryService,
          serviceConfigId: primaryConfigs[0].id,
        };
      }

      // Fallback to overseerr
      const overseerrConfigs =
        await mediaServiceConfigRepository.findEnabledByType(fallbackService);
      if (overseerrConfigs.length > 0) {
        return {
          serviceType: fallbackService,
          serviceConfigId: overseerrConfigs[0].id,
        };
      }

      logger.warn('No enabled services found for media type', { mediaType });
      return null;
    } catch (error) {
      logger.error('Failed to get highest priority service', { mediaType, error });
      return null;
    }
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    cacheService.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return cacheService.getStats();
  }
}

// Export singleton instance
export const mediaSearchService = new MediaSearchService();
