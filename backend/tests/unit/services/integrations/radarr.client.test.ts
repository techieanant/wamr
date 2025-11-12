import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RadarrClient } from '../../../../src/services/integrations/radarr.client.js';
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

describe('RadarrClient', () => {
  let client: RadarrClient;
  let mockAxiosInstance: any;

  const baseUrl = 'http://localhost:7878';
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

    client = new RadarrClient(baseUrl, apiKey);
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
          version: '4.3.2.6857',
          buildTime: '2023-01-01T00:00:00Z',
          branch: 'develop',
          osName: 'Ubuntu',
          osVersion: '20.04',
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result).toEqual({
        success: true,
        message: 'Successfully connected to Radarr',
        version: '4.3.2.6857',
        serverName: 'Radarr 4.3.2.6857',
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
        message: 'Failed to connect to Radarr',
      });
    });
  });

  describe('searchMovies', () => {
    it('should return search results when search succeeds', async () => {
      const mockResponse = {
        data: [
          {
            title: 'Test Movie',
            originalTitle: 'Test Movie Original',
            year: 2023,
            overview: 'A test movie',
            tmdbId: 12345,
            imdbId: 'tt1234567',
            titleSlug: 'test-movie-12345',
            runtime: 120,
            images: [
              {
                coverType: 'poster',
                url: '/poster.jpg',
                remoteUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
              },
            ],
            ratings: { votes: 100, value: 8.5 },
            genres: ['Action', 'Adventure'],
            hasFile: false,
            monitored: true,
          },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.searchMovies('test query');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/movie/lookup', {
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
          url: '/api/v3/movie/lookup?term=test',
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.searchMovies('test query');

      expect(result).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      const mockError = {
        request: {},
        code: 'ECONNREFUSED',
        config: {
          baseURL: baseUrl,
          url: '/api/v3/movie/lookup?term=test',
          timeout: 9000,
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.searchMovies('test query');

      expect(result).toEqual([]);
    });
  });

  describe('addMovie', () => {
    const movieParams = {
      title: 'Test Movie',
      year: 2023,
      tmdbId: 12345,
      titleSlug: 'test-movie-12345',
      qualityProfileId: 1,
      rootFolderPath: '/movies',
    };

    it('should successfully add a movie', async () => {
      const mockResponse = {
        data: {
          title: 'Test Movie',
          year: 2023,
          tmdbId: 12345,
          titleSlug: 'test-movie-12345',
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          monitored: true,
          hasFile: false,
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.addMovie(movieParams);

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v3/movie', {
        title: 'Test Movie',
        year: 2023,
        tmdbId: 12345,
        titleSlug: 'test-movie-12345',
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        images: [],
        monitored: true,
        addOptions: {
          searchForMovie: true,
        },
      });
    });

    it('should handle custom parameters', async () => {
      const customParams = {
        ...movieParams,
        images: [{ coverType: 'poster', url: '/poster.jpg' }],
        monitored: false,
        searchForMovie: false,
      };

      const mockResponse = { data: { ...customParams, hasFile: false } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.addMovie(customParams);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v3/movie', {
        title: 'Test Movie',
        year: 2023,
        tmdbId: 12345,
        titleSlug: 'test-movie-12345',
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        images: [{ coverType: 'poster', url: '/poster.jpg' }],
        monitored: false,
        addOptions: {
          searchForMovie: false,
        },
      });
    });

    it('should throw error when adding movie fails', async () => {
      const mockError = new Error('Movie already exists');
      mockAxiosInstance.post.mockRejectedValue(mockError);

      await expect(client.addMovie(movieParams)).rejects.toThrow('Movie already exists');
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
          { id: 1, path: '/movies', freeSpace: 1000000000 },
          { id: 2, path: '/tv', freeSpace: 500000000 },
        ],
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getRootFolders();

      expect(result).toEqual([
        { id: 1, path: '/movies', freeSpace: 1000000000 },
        { id: 2, path: '/tv', freeSpace: 500000000 },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/rootfolder');
    });

    it('should throw error when fetching root folders fails', async () => {
      const mockError = new Error('Failed to fetch folders');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getRootFolders()).rejects.toThrow('Failed to fetch folders');
    });
  });

  describe('getMovies', () => {
    it('should return all movies', async () => {
      const mockMovies = [
        { title: 'Movie 1', tmdbId: 1, year: 2020 },
        { title: 'Movie 2', tmdbId: 2, year: 2021 },
      ];
      const mockResponse = { data: mockMovies };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getMovies();

      expect(result).toEqual(mockMovies);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/movie');
    });

    it('should throw error when fetching movies fails', async () => {
      const mockError = new Error('Failed to fetch movies');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getMovies()).rejects.toThrow('Failed to fetch movies');
    });
  });

  describe('getMovieById', () => {
    it('should return movie when found', async () => {
      const mockMovie = { title: 'Test Movie', tmdbId: 12345, year: 2023 };
      const mockResponse = { data: mockMovie };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getMovieById(123);

      expect(result).toEqual(mockMovie);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/movie/123');
    });

    it('should return null when movie not found (404)', async () => {
      const mockError = {
        response: { status: 404 },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const result = await client.getMovieById(123);

      expect(result).toBeNull();
    });

    it('should throw error for other API errors', async () => {
      const mockError = {
        response: { status: 500 },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getMovieById(123)).rejects.toThrow();
    });
  });

  describe('getMovieByTmdbId', () => {
    it('should return movie when found by TMDB ID', async () => {
      const mockMovies = [
        { title: 'Movie 1', tmdbId: 11111, year: 2020 },
        { title: 'Movie 2', tmdbId: 22222, year: 2021 },
        { title: 'Test Movie', tmdbId: 12345, year: 2023 },
      ];
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockMovies }) // getMovies call
        .mockResolvedValueOnce({ data: mockMovies[2] }); // getMovieById call (not actually used in this test)

      const result = await client.getMovieByTmdbId(12345);

      expect(result).toEqual(mockMovies[2]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v3/movie');
    });

    it('should return null when movie not found by TMDB ID', async () => {
      const mockMovies = [
        { title: 'Movie 1', tmdbId: 11111, year: 2020 },
        { title: 'Movie 2', tmdbId: 22222, year: 2021 },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockMovies });

      const result = await client.getMovieByTmdbId(12345);

      expect(result).toBeNull();
    });

    it('should throw error when fetching movies fails', async () => {
      const mockError = new Error('Failed to fetch movies');
      mockAxiosInstance.get.mockRejectedValue(mockError);

      await expect(client.getMovieByTmdbId(12345)).rejects.toThrow('Failed to fetch movies');
    });
  });
});
