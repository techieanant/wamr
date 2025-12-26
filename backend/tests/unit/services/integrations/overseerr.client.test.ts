import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverseerrClient } from '../../../../src/services/integrations/overseerr.client.js';
import { BaseServiceClient } from '../../../../src/services/integrations/base-service.client.js';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

// Mock BaseServiceClient
vi.mock('../../../../src/services/integrations/base-service.client.js', () => ({
  BaseServiceClient: {
    createClient: vi.fn(),
  },
}));

describe('OverseerrClient', () => {
  let client: OverseerrClient;
  let mockAxiosInstance: any;

  const baseUrl = 'http://localhost:5055';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
    };

    // Mock BaseServiceClient.createClient to return our mock instance
    vi.mocked(BaseServiceClient.createClient).mockReturnValue(mockAxiosInstance);

    client = new OverseerrClient(baseUrl, apiKey);
  });

  describe('constructor', () => {
    it('should create client with correct base URL and API key', () => {
      expect(BaseServiceClient.createClient).toHaveBeenCalledWith(baseUrl, apiKey);
    });
  });

  describe('testConnection', () => {
    it('should return success response when connection test succeeds', async () => {
      const mockResponse = {
        data: {
          version: '1.33.2',
          commitTag: '1.33.2',
          updateAvailable: false,
          commitsBehind: 0,
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result).toEqual({
        success: true,
        message: 'Successfully connected to Overseerr',
        version: '1.33.2',
        serverName: 'Overseerr 1.33.2',
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/status');
    });

    it('should return failure response when connection test fails', async () => {
      const mockError = new Error('Connection refused');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.testConnection();

      expect(result).toEqual({
        success: false,
        message: 'Connection refused',
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/status');
    });

    it('should handle unknown errors', async () => {
      mockAxiosInstance.get.mockRejectedValue('string error');

      const result = await client.testConnection();

      expect(result).toEqual({
        success: false,
        message: 'Failed to connect to Overseerr',
      });
    });
  });

  describe('search', () => {
    it('should return search results when search succeeds', async () => {
      const mockResponse = {
        data: {
          page: 1,
          totalPages: 2,
          totalResults: 25,
          results: [
            {
              id: 123,
              mediaType: 'movie',
              title: 'Test Movie',
              releaseDate: '2023-01-01',
              overview: 'A test movie',
              posterPath: '/poster.jpg',
              voteAverage: 8.5,
              mediaInfo: {
                tmdbId: 12345,
                status: 5,
                requests: [],
              },
            },
          ],
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.search('test query');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/search?query=test%20query&page=1'
      );
    });

    it('should return empty results for queries shorter than 2 characters', async () => {
      const result = await client.search('a');

      expect(result).toEqual({
        page: 1,
        totalPages: 0,
        totalResults: 0,
        results: [],
      });
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should handle search API errors gracefully', async () => {
      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
        },
        config: {
          baseURL: baseUrl,
          url: '/api/v1/search?query=test&page=1',
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.search('test query');

      expect(result).toEqual({
        page: 1,
        totalPages: 0,
        totalResults: 0,
        results: [],
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/search?query=test%20query&page=1'
      );
    });

    it('should handle network errors', async () => {
      const mockError = {
        request: {},
        code: 'ECONNREFUSED',
        config: {
          baseURL: baseUrl,
          url: '/api/v1/search?query=test&page=1',
          timeout: 9000,
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.search('test query');

      expect(result).toEqual({
        page: 1,
        totalPages: 0,
        totalResults: 0,
        results: [],
      });
    });

    it('should properly URL encode query parameters', async () => {
      const mockResponse = { data: { page: 1, totalPages: 0, totalResults: 0, results: [] } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await client.search('test & query');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/search?query=test%20%26%20query&page=1'
      );
    });
  });

  describe('requestMovie', () => {
    const movieParams = {
      mediaId: 12345,
      serverId: 1,
      profileId: 2,
      rootFolder: '/movies',
    };

    it('should successfully request a movie', async () => {
      const mockResponse = {
        data: {
          id: 100,
          status: 2,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
          type: 'movie',
          is4k: false,
          media: {
            id: 12345,
            mediaType: 'movie',
            tmdbId: 12345,
            status: 2,
          },
          seasons: [],
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.requestMovie(movieParams);

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/request', {
        mediaType: 'movie',
        mediaId: 12345,
        is4k: false,
        serverId: 1,
        profileId: 2,
        rootFolder: '/movies',
      });
    });

    it('should handle 4K movie requests', async () => {
      const mockResponse = { data: { id: 101, type: 'movie', is4k: true } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.requestMovie({ ...movieParams, is4k: true });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/request', {
        mediaType: 'movie',
        mediaId: 12345,
        is4k: true,
        serverId: 1,
        profileId: 2,
        rootFolder: '/movies',
      });
    });

    it('should throw error when movie request fails', async () => {
      const mockError = new Error('Request failed');
      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(client.requestMovie(movieParams)).rejects.toThrow('Request failed');
    });

    it('should throw a descriptive error for 409 Conflict (duplicate request)', async () => {
      const mockError = new Error('Request failed with status code 409');
      (mockError as any).response = { status: 409 };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const error = await client.requestMovie(movieParams).catch((e) => e);

      expect(error.message).toContain('already exists or has a pending request');
      expect((error as any).statusCode).toBe(409);
    });
  });

  describe('requestSeries', () => {
    const seriesParams = {
      mediaId: 67890,
      serverId: 1,
      profileId: 2,
      rootFolder: '/tv',
    };

    it('should successfully request a series with all seasons', async () => {
      const mockResponse = {
        data: {
          id: 200,
          status: 2,
          type: 'tv',
          is4k: false,
          media: {
            id: 67890,
            mediaType: 'tv',
            tvdbId: 67890,
            status: 2,
          },
          seasons: [],
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.requestSeries(seriesParams);

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/request', {
        mediaType: 'tv',
        mediaId: 67890,
        seasons: 'all',
        is4k: false,
        serverId: 1,
        profileId: 2,
        rootFolder: '/tv',
      });
    });

    it('should request specific seasons when provided', async () => {
      const mockResponse = { data: { id: 201, type: 'tv' } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.requestSeries({ ...seriesParams, seasons: [1, 2, 3] });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/request', {
        mediaType: 'tv',
        mediaId: 67890,
        seasons: [1, 2, 3],
        is4k: false,
        serverId: 1,
        profileId: 2,
        rootFolder: '/tv',
      });
    });

    it('should handle 4K series requests', async () => {
      const mockResponse = { data: { id: 202, type: 'tv', is4k: true } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.requestSeries({ ...seriesParams, is4k: true });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/request', {
        mediaType: 'tv',
        mediaId: 67890,
        seasons: 'all',
        is4k: true,
        serverId: 1,
        profileId: 2,
        rootFolder: '/tv',
      });
    });

    it('should throw error when series request fails', async () => {
      const mockError = new Error('Series request failed');
      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(client.requestSeries(seriesParams)).rejects.toThrow('Series request failed');
    });

    it('should throw a descriptive error for 409 Conflict (duplicate request)', async () => {
      const mockError = new Error('Request failed with status code 409');
      (mockError as any).response = { status: 409 };
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const error = await client.requestSeries(seriesParams).catch((e) => e);

      expect(error.message).toContain('already exists or has a pending request');
      expect((error as any).statusCode).toBe(409);
    });
  });

  describe('getRadarrServers', () => {
    it('should return mapped Radarr servers', async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            name: 'Radarr Server 1',
            hostname: 'localhost',
            port: 7878,
            apiKey: 'radarr-key',
            useSsl: false,
            baseUrl: '/',
            activeProfileId: 1,
            activeProfileName: 'HD',
            activeDirectory: '/movies',
            is4k: false,
            minimumAvailability: 'announced',
            isDefault: true,
            externalUrl: 'http://localhost:7878',
            syncEnabled: true,
            preventSearch: false,
            tagRequests: false,
            tags: [],
          },
          {
            id: 2,
            name: 'Radarr Server 2',
            isDefault: false,
          },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getRadarrServers();

      expect(result).toEqual([
        {
          id: 1,
          name: 'Radarr Server 1',
          type: 'radarr',
          isDefault: true,
        },
        {
          id: 2,
          name: 'Radarr Server 2',
          type: 'radarr',
          isDefault: false,
        },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/settings/radarr');
    });

    it('should throw error when fetching Radarr servers fails', async () => {
      const mockError = new Error('Failed to fetch servers');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getRadarrServers()).rejects.toThrow('Failed to fetch servers');
    });
  });

  describe('getSonarrServers', () => {
    it('should return mapped Sonarr servers', async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            name: 'Sonarr Server 1',
            hostname: 'localhost',
            port: 8989,
            apiKey: 'sonarr-key',
            useSsl: false,
            baseUrl: '/',
            activeProfileId: 1,
            activeProfileName: 'HD',
            activeDirectory: '/tv',
            is4k: false,
            enableSeasonFolders: true,
            isDefault: true,
            externalUrl: 'http://localhost:8989',
            syncEnabled: true,
            preventSearch: false,
            tagRequests: false,
            tags: [],
          },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getSonarrServers();

      expect(result).toEqual([
        {
          id: 1,
          name: 'Sonarr Server 1',
          type: 'sonarr',
          isDefault: true,
        },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/settings/sonarr');
    });

    it('should throw error when fetching Sonarr servers fails', async () => {
      const mockError = new Error('Failed to fetch servers');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getSonarrServers()).rejects.toThrow('Failed to fetch servers');
    });
  });

  describe('getTvDetails', () => {
    it('should return TV show details with season information', async () => {
      const mockResponse = {
        data: {
          id: 1399,
          name: 'Game of Thrones',
          overview: 'Seven noble families fight for control of the mythical land of Westeros.',
          seasons: [
            {
              id: 3624,
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 10,
              airDate: '2011-04-17',
              overview: 'The first season of Game of Thrones',
              posterPath: '/season1.jpg',
            },
            {
              id: 3625,
              seasonNumber: 2,
              name: 'Season 2',
              episodeCount: 10,
              airDate: '2012-04-01',
              overview: 'The second season of Game of Thrones',
              posterPath: '/season2.jpg',
            },
          ],
          mediaInfo: {
            id: 1,
            tmdbId: 1399,
            tvdbId: 121361,
            status: 4, // Partially available
            requests: [],
            seasons: [
              {
                id: 1,
                seasonNumber: 1,
                status: 5, // Season 1 is available
              },
              {
                id: 2,
                seasonNumber: 2,
                status: 3, // Season 2 is processing
              },
            ],
          },
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getTvDetails(1399);

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/tv/1399');
    });

    it('should throw error when fetching TV details fails', async () => {
      const mockError = new Error('TV show not found');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getTvDetails(99999)).rejects.toThrow('TV show not found');
    });
  });
});
