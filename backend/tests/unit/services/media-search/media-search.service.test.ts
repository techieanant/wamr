import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mediaSearchService } from '../../../../src/services/media-search/media-search.service';
import { cacheService } from '../../../../src/services/media-search/cache.service';
import { resultNormalizerService } from '../../../../src/services/media-search/result-normalizer';
import { RadarrClient } from '../../../../src/services/integrations/radarr.client';
import { SonarrClient } from '../../../../src/services/integrations/sonarr.client';
import { OverseerrClient } from '../../../../src/services/integrations/overseerr.client';
import { mediaServiceConfigRepository } from '../../../../src/repositories/media-service-config.repository';
import { encryptionService } from '../../../../src/services/encryption/encryption.service';
import type { NormalizedResult } from '../../../../src/types/media-result.types';

// Mock all dependencies
vi.mock('../../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/repositories/media-service-config.repository', () => ({
  mediaServiceConfigRepository: {
    findAll: vi.fn(),
    findEnabledByType: vi.fn(),
  },
}));

vi.mock('../../../../src/services/encryption/encryption.service', () => ({
  encryptionService: {
    decrypt: vi.fn(),
  },
}));

vi.mock('../../../../src/services/integrations/radarr.client', () => ({
  RadarrClient: vi.fn(),
}));

vi.mock('../../../../src/services/integrations/sonarr.client', () => ({
  SonarrClient: vi.fn(),
}));

vi.mock('../../../../src/services/integrations/overseerr.client', () => ({
  OverseerrClient: vi.fn(),
}));

vi.mock('../../../../src/services/media-search/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn(),
  },
}));

vi.mock('../../../../src/services/media-search/result-normalizer', () => ({
  resultNormalizerService: {
    combineAndProcess: vi.fn(),
  },
}));

describe('MediaSearchService', () => {
  let mockRadarrClient: any;
  let mockSonarrClient: any;
  let mockOverseerrClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock clients
    mockRadarrClient = {
      searchMovies: vi.fn(),
    };
    mockSonarrClient = {
      searchSeries: vi.fn(),
    };
    mockOverseerrClient = {
      search: vi.fn(),
    };

    vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient);
    vi.mocked(SonarrClient).mockImplementation(() => mockSonarrClient);
    vi.mocked(OverseerrClient).mockImplementation(() => mockOverseerrClient);
  });

  describe('search', () => {
    const mockResults: NormalizedResult[] = [
      {
        title: 'Test Movie',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 12345,
        overview: 'A test movie',
        posterPath: '/poster.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      },
    ];

    it('should return cached results when available (both types)', async () => {
      const movieCache = [mockResults[0]];
      const seriesCache = [
        {
          ...mockResults[0],
          mediaType: 'series' as const,
          title: 'Test Series',
          tvdbId: 67890,
          tmdbId: null,
        },
      ];

      vi.mocked(cacheService.get).mockReturnValueOnce(movieCache);
      vi.mocked(cacheService.get).mockReturnValueOnce(seriesCache);

      const result = await mediaSearchService.search('movie', 'test query', true);

      expect(result).toEqual({
        results: [...movieCache, ...seriesCache],
        searchedServices: [],
        failedServices: [],
        fromCache: true,
        searchDuration: expect.any(Number),
      });
      expect(cacheService.get).toHaveBeenCalledWith('movie', 'test query');
      expect(cacheService.get).toHaveBeenCalledWith('series', 'test query');
    });

    it('should return cached results for specific media type', async () => {
      vi.mocked(cacheService.get).mockReturnValue(mockResults);

      const result = await mediaSearchService.search('movie', 'test query', false);

      expect(result).toEqual({
        results: mockResults,
        searchedServices: [],
        failedServices: [],
        fromCache: true,
        searchDuration: expect.any(Number),
      });
      expect(cacheService.get).toHaveBeenCalledWith('movie', 'test query');
    });

    it('should perform search when cache miss', async () => {
      // Mock cache miss
      vi.mocked(cacheService.get).mockReturnValue(null);

      // Mock repository calls
      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Test Sonarr',
          serviceType: 'sonarr' as const,
          baseUrl: 'http://sonarr:8989',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 5,
          qualityProfileId: 1,
          rootFolderPath: '/series',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          name: 'Test Overseerr',
          serviceType: 'overseerr' as const,
          baseUrl: 'http://overseerr:5055',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 8,
          qualityProfileId: null,
          rootFolderPath: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findAll).mockResolvedValue(mockConfigs);
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockImplementation(
        (type: string) => {
          switch (type) {
            case 'radarr':
              return Promise.resolve([mockConfigs[0]]);
            case 'sonarr':
              return Promise.resolve([mockConfigs[1]]);
            case 'overseerr':
              return Promise.resolve([mockConfigs[2]]);
            default:
              return Promise.resolve([]);
          }
        }
      );

      // Mock encryption
      vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

      // Mock client responses
      mockRadarrClient.searchMovies.mockResolvedValue([{ title: 'Radarr Movie', year: 2020 }]);
      mockSonarrClient.searchSeries.mockResolvedValue([{ title: 'Sonarr Series', year: 2021 }]);
      mockOverseerrClient.search.mockResolvedValue({
        results: [{ title: 'Overseerr Movie', mediaType: 'movie', id: 12345 }],
      });

      // Mock normalizer
      vi.mocked(resultNormalizerService.combineAndProcess).mockReturnValue(mockResults);

      const result = await mediaSearchService.search('movie', 'test query', false);

      expect(result).toEqual({
        results: mockResults,
        searchedServices: ['radarr', 'overseerr'],
        failedServices: [],
        fromCache: false,
        searchDuration: expect.any(Number),
      });

      expect(cacheService.set).toHaveBeenCalledWith('movie', 'test query', mockResults);
    });

    it('should handle service failures gracefully', async () => {
      vi.mocked(cacheService.get).mockReturnValue(null);

      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findAll).mockResolvedValue(mockConfigs);
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue([]); // No enabled configs
      vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

      mockRadarrClient.searchMovies.mockRejectedValue(new Error('Connection failed'));
      vi.mocked(resultNormalizerService.combineAndProcess).mockReturnValue([]);

      const result = await mediaSearchService.search('movie', 'test query', false);

      expect(result).toEqual({
        results: [],
        searchedServices: ['radarr', 'overseerr'],
        failedServices: [],
        fromCache: false,
        searchDuration: expect.any(Number),
      });
    });

    it('should handle timeout errors', async () => {
      vi.mocked(cacheService.get).mockReturnValue(null);

      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findAll).mockResolvedValue(mockConfigs);
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue([mockConfigs[0]]);
      vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

      // Mock timeout
      mockRadarrClient.searchMovies.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Search timeout')), 3000);
          })
      );

      vi.mocked(resultNormalizerService.combineAndProcess).mockReturnValue([]);

      const result = await mediaSearchService.search('movie', 'test query', false);

      expect(result.failedServices).toEqual([]);
    });

    it('should use maximum maxResults from enabled configs', async () => {
      vi.mocked(cacheService.get).mockReturnValue(null);

      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 5,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Test Sonarr',
          serviceType: 'sonarr' as const,
          baseUrl: 'http://sonarr:8989',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/series',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findAll).mockResolvedValue(mockConfigs);
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue([mockConfigs[1]]);
      vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

      mockSonarrClient.searchSeries.mockResolvedValue([{ title: 'Test Series', year: 2020 }]);
      vi.mocked(resultNormalizerService.combineAndProcess).mockReturnValue(mockResults);

      await mediaSearchService.search('series', 'test query', false);

      expect(resultNormalizerService.combineAndProcess).toHaveBeenCalledWith(
        [],
        [{ title: 'Test Series', year: 2020 }],
        [],
        10 // Should use the maximum maxResults
      );
    });

    it('should search all services when searchBoth is true', async () => {
      vi.mocked(cacheService.get).mockReturnValue(null);

      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Test Sonarr',
          serviceType: 'sonarr' as const,
          baseUrl: 'http://sonarr:8989',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/series',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          name: 'Test Overseerr',
          serviceType: 'overseerr' as const,
          baseUrl: 'http://overseerr:5055',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: null,
          rootFolderPath: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findAll).mockResolvedValue(mockConfigs);
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue([mockConfigs[0]]);
      vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

      mockRadarrClient.searchMovies.mockResolvedValue([{ title: 'Radarr Movie', year: 2020 }]);
      vi.mocked(resultNormalizerService.combineAndProcess).mockReturnValue(mockResults);

      await mediaSearchService.search('movie', 'test query', true);

      expect(resultNormalizerService.combineAndProcess).toHaveBeenCalledWith(
        [{ title: 'Radarr Movie', year: 2020 }],
        [],
        [],
        10
      );
    });
  });

  describe('getHighestPriorityService', () => {
    it('should return highest priority service for movies', async () => {
      const mockConfigs = [
        {
          id: 1,
          name: 'Test Radarr',
          serviceType: 'radarr' as const,
          baseUrl: 'http://radarr:7878',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue(mockConfigs);

      const result = await mediaSearchService.getHighestPriorityService('movie');

      expect(result).toEqual({
        serviceType: 'radarr',
        serviceConfigId: 1,
      });
    });

    it('should return highest priority service for series', async () => {
      const mockConfigs = [
        {
          id: 2,
          name: 'Test Sonarr',
          serviceType: 'sonarr' as const,
          baseUrl: 'http://sonarr:8989',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 10,
          qualityProfileId: 1,
          rootFolderPath: '/series',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue(mockConfigs);

      const result = await mediaSearchService.getHighestPriorityService('series');

      expect(result).toEqual({
        serviceType: 'sonarr',
        serviceConfigId: 2,
      });
    });

    it('should fallback to overseerr when primary service not available', async () => {
      // No radarr configs, but overseerr available
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockImplementation(
        (type: string) => {
          if (type === 'radarr') return Promise.resolve([]);
          if (type === 'overseerr')
            return Promise.resolve([
              {
                id: 3,
                name: 'Test Overseerr',
                serviceType: 'overseerr' as const,
                baseUrl: 'http://overseerr:5055',
                apiKeyEncrypted: 'encrypted-key',
                enabled: true,
                priorityOrder: 1,
                maxResults: 10,
                qualityProfileId: null,
                rootFolderPath: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);
          return Promise.resolve([]);
        }
      );

      const result = await mediaSearchService.getHighestPriorityService('movie');

      expect(result).toEqual({
        serviceType: 'overseerr',
        serviceConfigId: 3,
      });
    });

    it('should return null when no services available', async () => {
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockResolvedValue([]);

      const result = await mediaSearchService.getHighestPriorityService('movie');

      expect(result).toBeNull();
    });

    it('should handle repository errors', async () => {
      vi.mocked(mediaServiceConfigRepository.findEnabledByType).mockRejectedValue(
        new Error('DB error')
      );

      const result = await mediaSearchService.getHighestPriorityService('movie');

      expect(result).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', () => {
      mediaSearchService.clearCache();
      expect(cacheService.clear).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const mockStats = { hits: 10, misses: 5, entries: 3, hitRate: 0.67 };
      vi.mocked(cacheService.getStats).mockReturnValue(mockStats);

      const result = mediaSearchService.getCacheStats();

      expect(result).toEqual(mockStats);
    });
  });
});
