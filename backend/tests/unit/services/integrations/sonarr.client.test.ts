import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarrClient } from '../../../../src/services/integrations/sonarr.client.js';
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

describe('SonarrClient', () => {
  let client: SonarrClient;
  let mockAxiosInstance: any;

  const baseUrl = 'http://localhost:8989';
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

    client = new SonarrClient(baseUrl, apiKey);
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
          version: '4.0.0.667',
          buildTime: '2023-01-01T00:00:00Z',
          branch: 'main',
          osName: 'Ubuntu',
          osVersion: '20.04',
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result).toEqual({
        success: true,
        message: 'Successfully connected to Sonarr',
        version: '4.0.0.667',
        serverName: 'Sonarr 4.0.0.667',
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/system/status');
    });

    it('should return failure response when connection test fails', async () => {
      const mockError = new Error('Connection refused');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.testConnection();

      expect(result).toEqual({
        success: false,
        message: 'Connection refused',
      });
    });

    it('should handle unknown errors', async () => {
      mockAxiosInstance.get.mockRejectedValue('string error');

      const result = await client.testConnection();

      expect(result).toEqual({
        success: false,
        message: 'Failed to connect to Sonarr',
      });
    });
  });

  describe('searchSeries', () => {
    it('should return search results when search succeeds', async () => {
      const mockResponse = {
        data: [
          {
            title: 'Test Series',
            sortTitle: 'test series',
            year: 2023,
            overview: 'A test TV series',
            tvdbId: 12345,
            tvRageId: 67890,
            imdbId: 'tt1234567',
            titleSlug: 'test-series-12345',
            status: 'continuing',
            ended: false,
            network: 'Test Network',
            airTime: '20:00',
            runtime: 60,
            images: [
              {
                coverType: 'poster',
                url: '/poster.jpg',
                remoteUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
              },
            ],
            seasons: [
              { seasonNumber: 1, monitored: true },
              { seasonNumber: 2, monitored: true },
            ],
            ratings: { votes: 1000, value: 8.5 },
            genres: ['Drama', 'Mystery'],
            firstAired: '2023-01-01',
            seriesType: 'standard',
            certification: 'TV-14',
            monitored: true,
          },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchSeries('test query');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/series/lookup', {
        params: { term: 'test query' },
      });
    });

    it('should return empty array when search fails', async () => {
      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
        },
        config: {
          baseURL: baseUrl,
          url: '/api/v3/series/lookup?term=test',
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.searchSeries('test query');

      expect(result).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      const mockError = {
        request: {},
        code: 'ECONNREFUSED',
        config: {
          baseURL: baseUrl,
          url: '/api/v3/series/lookup?term=test',
          timeout: 9000,
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.searchSeries('test query');

      expect(result).toEqual([]);
    });
  });

  describe('addSeries', () => {
    const seriesParams = {
      title: 'Test Series',
      year: 2023,
      tvdbId: 12345,
      titleSlug: 'test-series-12345',
      qualityProfileId: 1,
      rootFolderPath: '/tv',
    };

    it('should successfully add a series', async () => {
      const mockResponse = {
        data: {
          title: 'Test Series',
          year: 2023,
          tvdbId: 12345,
          titleSlug: 'test-series-12345',
          qualityProfileId: 1,
          rootFolderPath: '/tv',
          monitored: true,
          seasons: [],
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.addSeries(seriesParams);

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v3/series', {
        title: 'Test Series',
        year: 2023,
        tvdbId: 12345,
        titleSlug: 'test-series-12345',
        qualityProfileId: 1,
        rootFolderPath: '/tv',
        images: [],
        seasons: [],
        monitored: true,
        seasonFolder: true,
        addOptions: {
          searchForMissingEpisodes: true,
        },
      });
    });

    it('should handle custom parameters', async () => {
      const customParams = {
        ...seriesParams,
        images: [{ coverType: 'poster', url: '/poster.jpg' }],
        seasons: [{ seasonNumber: 1, monitored: true }],
        monitored: false,
        searchForMissingEpisodes: false,
      };

      const mockResponse = { data: { ...customParams, hasFile: false } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.addSeries(customParams);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v3/series', {
        title: 'Test Series',
        year: 2023,
        tvdbId: 12345,
        titleSlug: 'test-series-12345',
        qualityProfileId: 1,
        rootFolderPath: '/tv',
        images: [{ coverType: 'poster', url: '/poster.jpg' }],
        seasons: [{ seasonNumber: 1, monitored: true }],
        monitored: false,
        seasonFolder: true,
        addOptions: {
          searchForMissingEpisodes: false,
        },
      });
    });

    it('should throw error when adding series fails', async () => {
      const mockError = new Error('Series already exists');
      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(client.addSeries(seriesParams)).rejects.toThrow('Series already exists');
    });
  });

  describe('getQualityProfiles', () => {
    it('should return mapped quality profiles', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'HD-1080p' },
          { id: 2, name: '4K' },
          { id: 3, name: 'SD' },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getQualityProfiles();

      expect(result).toEqual([
        { id: 1, name: 'HD-1080p' },
        { id: 2, name: '4K' },
        { id: 3, name: 'SD' },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/qualityprofile');
    });

    it('should throw error when fetching quality profiles fails', async () => {
      const mockError = new Error('Failed to fetch profiles');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getQualityProfiles()).rejects.toThrow('Failed to fetch profiles');
    });
  });

  describe('getRootFolders', () => {
    it('should return mapped root folders', async () => {
      const mockResponse = {
        data: [
          { id: 1, path: '/tv', freeSpace: 2000000000 },
          { id: 2, path: '/series', freeSpace: 1000000000 },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getRootFolders();

      expect(result).toEqual([
        { id: 1, path: '/tv', freeSpace: 2000000000 },
        { id: 2, path: '/series', freeSpace: 1000000000 },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/rootfolder');
    });

    it('should throw error when fetching root folders fails', async () => {
      const mockError = new Error('Failed to fetch folders');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getRootFolders()).rejects.toThrow('Failed to fetch folders');
    });
  });

  describe('getSeries', () => {
    it('should return all series', async () => {
      const mockSeries = [
        { title: 'Series 1', tvdbId: 1, year: 2020 },
        { title: 'Series 2', tvdbId: 2, year: 2021 },
      ];
      const mockResponse = { data: mockSeries };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getSeries();

      expect(result).toEqual(mockSeries);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/series');
    });

    it('should throw error when fetching series fails', async () => {
      const mockError = new Error('Failed to fetch series');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getSeries()).rejects.toThrow('Failed to fetch series');
    });
  });

  describe('getSeriesById', () => {
    it('should return series when found', async () => {
      const mockSeries = { title: 'Test Series', tvdbId: 12345, year: 2023 };
      const mockResponse = { data: mockSeries };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getSeriesById(123);

      expect(result).toEqual(mockSeries);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/series/123');
    });

    it('should return null when series not found (404)', async () => {
      const mockError = {
        response: { status: 404 },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.getSeriesById(123);

      expect(result).toBeNull();
    });

    it('should throw error for other API errors', async () => {
      const mockError = {
        response: { status: 500 },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getSeriesById(123)).rejects.toThrow();
    });
  });

  describe('getSeriesByTvdbId', () => {
    it('should return series when found by TVDB ID', async () => {
      const mockSeries = [
        { title: 'Series 1', tvdbId: 11111, year: 2020 },
        { title: 'Series 2', tvdbId: 22222, year: 2021 },
        { title: 'Test Series', tvdbId: 12345, year: 2023 },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockSeries });

      const result = await client.getSeriesByTvdbId(12345);

      expect(result).toEqual(mockSeries[2]);
    });

    it('should return null when series not found by TVDB ID', async () => {
      const mockSeries = [
        { title: 'Series 1', tvdbId: 11111, year: 2020 },
        { title: 'Series 2', tvdbId: 22222, year: 2021 },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockSeries });

      const result = await client.getSeriesByTvdbId(12345);

      expect(result).toBeNull();
    });

    it('should throw error when fetching series fails', async () => {
      const mockError = new Error('Failed to fetch series');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getSeriesByTvdbId(12345)).rejects.toThrow('Failed to fetch series');
    });
  });
});
