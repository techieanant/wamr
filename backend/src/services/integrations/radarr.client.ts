import type { AxiosInstance } from 'axios';
import { BaseServiceClient } from './base-service.client.js';
import { logger } from '../../config/logger.js';
import type {
  TestConnectionResponse,
  QualityProfile,
  RootFolder,
} from '../../types/service-config.types.js';

/**
 * Radarr API v3 Response Types
 */
interface RadarrMovie {
  title: string;
  originalTitle?: string;
  year: number;
  overview: string;
  tmdbId: number;
  imdbId?: string;
  titleSlug: string;
  runtime?: number;
  images: Array<{
    coverType: string;
    url: string;
    remoteUrl?: string;
  }>;
  ratings?: {
    votes: number;
    value: number;
  };
  genres?: string[];
  hasFile?: boolean;
  monitored?: boolean;
}

interface RadarrSystemStatus {
  version: string;
  buildTime: string;
  branch: string;
  osName: string;
  osVersion: string;
}

interface RadarrQualityProfile {
  id: number;
  name: string;
}

interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

/**
 * Radarr API Client
 * Handles movie search and management via Radarr API v3
 */
export class RadarrClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.client = BaseServiceClient.createClient(baseUrl, apiKey);
  }

  /**
   * Test connection to Radarr instance
   */
  async testConnection(): Promise<TestConnectionResponse> {
    try {
      const response = await this.client.get<RadarrSystemStatus>('/api/v3/system/status');

      logger.info({ version: response.data.version }, 'Radarr connection test successful');

      return {
        success: true,
        message: 'Successfully connected to Radarr',
        version: response.data.version,
        serverName: `Radarr ${response.data.version}`,
      };
    } catch (error) {
      logger.error({ error }, 'Radarr connection test failed');

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Radarr',
      };
    }
  }

  /**
   * Search for movies by title
   */
  async searchMovies(query: string): Promise<RadarrMovie[]> {
    try {
      logger.debug({ query }, 'Starting Radarr movie search');

      const response = await this.client.get<RadarrMovie[]>('/api/v3/movie/lookup', {
        params: { term: query },
      });

      logger.debug({ query, count: response.data.length }, 'Radarr movie search completed');

      return response.data;
    } catch (error) {
      // Enhanced error logging with detailed information
      const errorDetails: any = {
        query,
        endpoint: '/api/v3/movie/lookup',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };

      // Add axios-specific error details
      if (error && typeof error === 'object') {
        const axiosError = error as any;

        if (axiosError.response) {
          // Server responded with error status
          errorDetails.errorType = 'API_RESPONSE_ERROR';
          errorDetails.httpStatus = axiosError.response.status;
          errorDetails.httpStatusText = axiosError.response.statusText;
          errorDetails.responseData = axiosError.response.data;
          errorDetails.baseUrl = axiosError.config?.baseURL;
          errorDetails.fullUrl = axiosError.config?.url;
        } else if (axiosError.request) {
          // Request was made but no response received
          errorDetails.errorType = 'NO_RESPONSE';
          errorDetails.code = axiosError.code;
          errorDetails.baseUrl = axiosError.config?.baseURL;
          errorDetails.fullUrl = axiosError.config?.url;
          errorDetails.timeout = axiosError.config?.timeout;
        } else {
          // Error setting up request
          errorDetails.errorType = 'REQUEST_SETUP_ERROR';
        }
      }

      logger.error(errorDetails, 'Radarr movie search failed');

      // Return empty array instead of throwing to allow other services to provide results
      return [];
    }
  }

  /**
   * Add movie to Radarr
   */
  async addMovie(params: {
    title: string;
    year: number;
    tmdbId: number;
    titleSlug: string;
    qualityProfileId: number;
    rootFolderPath: string;
    images?: Array<{ coverType: string; url: string }>;
    monitored?: boolean;
    searchForMovie?: boolean;
  }): Promise<RadarrMovie> {
    try {
      const body = {
        title: params.title,
        year: params.year,
        tmdbId: params.tmdbId,
        titleSlug: params.titleSlug,
        qualityProfileId: params.qualityProfileId,
        rootFolderPath: params.rootFolderPath,
        images: params.images || [],
        monitored: params.monitored ?? true,
        addOptions: {
          searchForMovie: params.searchForMovie ?? true,
        },
      };

      const response = await this.client.post<RadarrMovie>('/api/v3/movie', body);

      logger.info({ title: params.title, tmdbId: params.tmdbId }, 'Movie added to Radarr');

      return response.data;
    } catch (error) {
      logger.error({ error, title: params.title }, 'Failed to add movie to Radarr');
      throw error;
    }
  }

  /**
   * Get quality profiles
   */
  async getQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const response = await this.client.get<RadarrQualityProfile[]>('/api/v3/qualityprofile');

      return response.data.map((profile) => ({
        id: profile.id,
        name: profile.name,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Radarr quality profiles');
      throw error;
    }
  }

  /**
   * Get root folders
   */
  async getRootFolders(): Promise<RootFolder[]> {
    try {
      const response = await this.client.get<RadarrRootFolder[]>('/api/v3/rootfolder');

      return response.data.map((folder) => ({
        id: folder.id,
        path: folder.path,
        freeSpace: folder.freeSpace,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Radarr root folders');
      throw error;
    }
  }

  /**
   * Get all movies from Radarr
   */
  async getMovies(): Promise<RadarrMovie[]> {
    try {
      logger.debug('Fetching all movies from Radarr');

      const response = await this.client.get<RadarrMovie[]>('/api/v3/movie');

      logger.debug({ count: response.data.length }, 'Radarr movies fetched');

      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Radarr movies');
      throw error;
    }
  }

  /**
   * Get a specific movie by ID from Radarr
   */
  async getMovieById(id: number): Promise<RadarrMovie | null> {
    try {
      logger.debug({ id }, 'Fetching movie from Radarr by ID');

      const response = await this.client.get<RadarrMovie>(`/api/v3/movie/${id}`);

      return response.data;
    } catch (error) {
      // 404 means movie not found
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.status === 404) {
          logger.debug({ id }, 'Movie not found in Radarr');
          return null;
        }
      }

      logger.error({ error, id }, 'Failed to fetch Radarr movie by ID');
      throw error;
    }
  }

  /**
   * Get a movie by TMDB ID from Radarr
   */
  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    try {
      logger.debug({ tmdbId }, 'Fetching movie from Radarr by TMDB ID');

      // Get all movies and find by TMDB ID
      const movies = await this.getMovies();
      const movie = movies.find((m) => m.tmdbId === tmdbId);

      if (movie) {
        logger.debug({ tmdbId, title: movie.title }, 'Found movie in Radarr');
      } else {
        logger.debug({ tmdbId }, 'Movie not found in Radarr');
      }

      return movie || null;
    } catch (error) {
      logger.error({ error, tmdbId }, 'Failed to fetch Radarr movie by TMDB ID');
      throw error;
    }
  }
}
