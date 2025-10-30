import type { AxiosInstance } from 'axios';
import { BaseServiceClient } from './base-service.client.js';
import { logger } from '../../config/logger.js';
import type { TestConnectionResponse } from '../../types/service-config.types.js';

/**
 * Overseerr API v1 Response Types
 */
interface OverseerrSearchResult {
  page: number;
  totalPages: number;
  totalResults: number;
  results: Array<{
    id: number;
    mediaType: 'movie' | 'tv';
    popularity: number;
    posterPath: string | null;
    backdropPath: string | null;
    voteCount: number;
    voteAverage: number;
    genreIds: number[];
    overview: string;
    originalLanguage: string;
    // Movie specific
    title?: string;
    originalTitle?: string;
    releaseDate?: string;
    adult?: boolean;
    video?: boolean;
    // TV specific
    name?: string;
    originalName?: string;
    firstAirDate?: string;
    // Media info
    mediaInfo?: {
      tmdbId?: number;
      tvdbId?: number;
      status: number; // 5 = available, 4 = partially available, 3 = processing, 2 = pending, 1 = unknown
      requests: unknown[];
    };
  }>;
}

interface OverseerrStatus {
  version: string;
  commitTag: string;
  updateAvailable: boolean;
  commitsBehind: number;
}

interface OverseerrRequestResponse {
  id: number;
  status: number; // 2 = pending, 3 = approved
  createdAt: string;
  updatedAt: string;
  type: 'movie' | 'tv';
  is4k: boolean;
  media: {
    id: number;
    mediaType: 'movie' | 'tv';
    tmdbId?: number;
    tvdbId?: number;
    status: number;
  };
  seasons: unknown[];
}

interface OverseerrRadarrServer {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl: string;
  activeProfileId: number;
  activeProfileName: string;
  activeDirectory: string;
  is4k: boolean;
  minimumAvailability: string;
  isDefault: boolean;
  externalUrl: string;
  syncEnabled: boolean;
  preventSearch: boolean;
  tagRequests: boolean;
  tags: number[];
}

interface OverseerrSonarrServer {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl: string;
  activeProfileId: number;
  activeProfileName: string;
  activeDirectory: string;
  is4k: boolean;
  enableSeasonFolders: boolean;
  isDefault: boolean;
  externalUrl: string;
  syncEnabled: boolean;
  preventSearch: boolean;
  tagRequests: boolean;
  tags: number[];
}

/**
 * Simplified server response for internal use
 */
interface OverseerrServer {
  id: number;
  name: string;
  type: 'radarr' | 'sonarr';
  isDefault: boolean;
}

/**
 * Overseerr API Client
 * Handles unified media search and requests via Overseerr API v1
 */
export class OverseerrClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.client = BaseServiceClient.createClient(baseUrl, apiKey);
  }

  /**
   * Test connection to Overseerr instance
   */
  async testConnection(): Promise<TestConnectionResponse> {
    try {
      const response = await this.client.get<OverseerrStatus>('/api/v1/status');

      logger.info({ version: response.data.version }, 'Overseerr connection test successful');

      return {
        success: true,
        message: 'Successfully connected to Overseerr',
        version: response.data.version,
        serverName: `Overseerr ${response.data.version}`,
      };
    } catch (error) {
      logger.error({ error }, 'Overseerr connection test failed');

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Overseerr',
      };
    }
  }

  /**
   * Search for movies and TV series
   */
  async search(query: string): Promise<OverseerrSearchResult> {
    try {
      // Overseerr requires minimum 2 characters for search
      if (query.length < 2) {
        logger.debug({ query }, 'Query too short for Overseerr search, returning empty results');
        return {
          page: 1,
          totalPages: 0,
          totalResults: 0,
          results: [],
        };
      }

      logger.debug({ query }, 'Starting Overseerr search');

      // URL encode the query parameter manually to satisfy Overseerr's strict validation
      const encodedQuery = encodeURIComponent(query);

      const response = await this.client.get<OverseerrSearchResult>(
        `/api/v1/search?query=${encodedQuery}&page=1`
      );

      logger.debug({ query, count: response.data.results.length }, 'Overseerr search completed');

      return response.data;
    } catch (error) {
      // Enhanced error logging with detailed information
      const errorDetails: any = {
        query,
        endpoint: '/api/v1/search',
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

      logger.error(errorDetails, 'Overseerr search failed');

      // Return empty results instead of throwing to allow other services to provide results
      return {
        page: 1,
        totalPages: 0,
        totalResults: 0,
        results: [],
      };
    }
  }

  /**
   * Request a movie
   */
  async requestMovie(params: {
    mediaId: number; // TMDB ID
    serverId: number;
    profileId: number;
    rootFolder: string;
    is4k?: boolean;
  }): Promise<OverseerrRequestResponse> {
    try {
      const body = {
        mediaType: 'movie',
        mediaId: params.mediaId,
        is4k: params.is4k ?? false,
        serverId: params.serverId,
        profileId: params.profileId,
        rootFolder: params.rootFolder,
      };

      const response = await this.client.post<OverseerrRequestResponse>('/api/v1/request', body);

      logger.info({ mediaId: params.mediaId }, 'Movie requested via Overseerr');

      return response.data;
    } catch (error) {
      logger.error({ error, mediaId: params.mediaId }, 'Failed to request movie via Overseerr');
      throw error;
    }
  }

  /**
   * Request a TV series (all seasons)
   */
  async requestSeries(params: {
    mediaId: number; // TVDB ID
    serverId: number;
    profileId: number;
    rootFolder: string;
    seasons?: 'all' | number[];
    is4k?: boolean;
  }): Promise<OverseerrRequestResponse> {
    try {
      const body = {
        mediaType: 'tv',
        mediaId: params.mediaId,
        seasons: params.seasons ?? 'all',
        is4k: params.is4k ?? false,
        serverId: params.serverId,
        profileId: params.profileId,
        rootFolder: params.rootFolder,
      };

      const response = await this.client.post<OverseerrRequestResponse>('/api/v1/request', body);

      logger.info({ mediaId: params.mediaId }, 'Series requested via Overseerr');

      return response.data;
    } catch (error) {
      logger.error({ error, mediaId: params.mediaId }, 'Failed to request series via Overseerr');
      throw error;
    }
  }

  /**
   * Get configured Radarr servers
   */
  async getRadarrServers(): Promise<OverseerrServer[]> {
    try {
      const response = await this.client.get<OverseerrRadarrServer[]>('/api/v1/settings/radarr');

      return response.data.map((server) => ({
        id: server.id,
        name: server.name,
        type: 'radarr' as const,
        isDefault: server.isDefault,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Overseerr Radarr servers');
      throw error;
    }
  }

  /**
   * Get configured Sonarr servers
   */
  async getSonarrServers(): Promise<OverseerrServer[]> {
    try {
      const response = await this.client.get<OverseerrSonarrServer[]>('/api/v1/settings/sonarr');

      return response.data.map((server) => ({
        id: server.id,
        name: server.name,
        type: 'sonarr' as const,
        isDefault: server.isDefault,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Overseerr Sonarr servers');
      throw error;
    }
  }
}
