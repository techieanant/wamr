import type { AxiosInstance } from 'axios';
import { BaseServiceClient } from './base-service.client.js';
import { logger } from '../../config/logger.js';
import type {
  TestConnectionResponse,
  QualityProfile,
  RootFolder,
} from '../../types/service-config.types.js';

/**
 * Sonarr API v3 Response Types
 */
interface SonarrSeries {
  title: string;
  sortTitle?: string;
  year: number;
  overview: string;
  tvdbId: number;
  tvRageId?: number;
  tvMazeId?: number;
  imdbId?: string;
  titleSlug: string;
  status?: string;
  ended?: boolean;
  network?: string;
  airTime?: string;
  runtime?: number;
  images: Array<{
    coverType: string;
    url: string;
    remoteUrl?: string;
  }>;
  seasons: Array<{
    seasonNumber: number;
    monitored: boolean;
    statistics?: {
      episodeFileCount: number;
      episodeCount: number;
      totalEpisodeCount: number;
      sizeOnDisk: number;
      percentOfEpisodes: number;
    };
  }>;
  ratings?: {
    votes: number;
    value: number;
  };
  genres?: string[];
  firstAired?: string;
  seriesType?: string;
  certification?: string;
  monitored?: boolean;
  statistics?: {
    seasonCount: number;
    episodeCount: number;
    episodeFileCount: number; // Number of downloaded episode files
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number; // Percentage of episodes downloaded
  };
}

interface SonarrEpisode {
  id: number;
  seriesId: number;
  tvdbId: number;
  episodeFileId: number; // 0 if not downloaded, >0 if downloaded
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate?: string;
  airDateUtc?: string;
  overview?: string;
  hasFile: boolean; // True if episode file exists
  monitored: boolean;
  unverifiedSceneNumbering: boolean;
}

interface SonarrSystemStatus {
  version: string;
  buildTime: string;
  branch: string;
  osName: string;
  osVersion: string;
}

interface SonarrQualityProfile {
  id: number;
  name: string;
}

interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

/**
 * Sonarr API Client
 * Handles TV series search and management via Sonarr API v3
 */
export class SonarrClient {
  private client: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.client = BaseServiceClient.createClient(baseUrl, apiKey);
  }

  /**
   * Test connection to Sonarr instance
   */
  async testConnection(): Promise<TestConnectionResponse> {
    try {
      const response = await this.client.get<SonarrSystemStatus>('/api/v3/system/status');

      logger.info({ version: response.data.version }, 'Sonarr connection test successful');

      return {
        success: true,
        message: 'Successfully connected to Sonarr',
        version: response.data.version,
        serverName: `Sonarr ${response.data.version}`,
      };
    } catch (error) {
      logger.error({ error }, 'Sonarr connection test failed');

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to Sonarr',
      };
    }
  }

  /**
   * Search for TV series by title
   */
  async searchSeries(query: string): Promise<SonarrSeries[]> {
    try {
      logger.debug({ query }, 'Starting Sonarr series search');

      const response = await this.client.get<SonarrSeries[]>('/api/v3/series/lookup', {
        params: { term: query },
      });

      logger.debug({ query, count: response.data.length }, 'Sonarr series search completed');

      return response.data;
    } catch (error) {
      // Enhanced error logging with detailed information
      const errorDetails: any = {
        query,
        endpoint: '/api/v3/series/lookup',
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

      logger.error(errorDetails, 'Sonarr series search failed');

      // Return empty array instead of throwing to allow other services to provide results
      return [];
    }
  }

  /**
   * Add TV series to Sonarr
   */
  async addSeries(params: {
    title: string;
    year: number;
    tvdbId: number;
    titleSlug: string;
    qualityProfileId: number;
    rootFolderPath: string;
    images?: Array<{ coverType: string; url: string }>;
    seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
    monitored?: boolean;
    searchForMissingEpisodes?: boolean;
  }): Promise<SonarrSeries> {
    try {
      const body = {
        title: params.title,
        year: params.year,
        tvdbId: params.tvdbId,
        titleSlug: params.titleSlug,
        qualityProfileId: params.qualityProfileId,
        rootFolderPath: params.rootFolderPath,
        images: params.images || [],
        seasons: params.seasons || [],
        monitored: params.monitored ?? true,
        seasonFolder: true,
        addOptions: {
          searchForMissingEpisodes: params.searchForMissingEpisodes ?? true,
        },
      };

      const response = await this.client.post<SonarrSeries>('/api/v3/series', body);

      logger.info({ title: params.title, tvdbId: params.tvdbId }, 'Series added to Sonarr');

      return response.data;
    } catch (error) {
      logger.error({ error, title: params.title }, 'Failed to add series to Sonarr');
      throw error;
    }
  }

  /**
   * Get quality profiles
   */
  async getQualityProfiles(): Promise<QualityProfile[]> {
    try {
      const response = await this.client.get<SonarrQualityProfile[]>('/api/v3/qualityprofile');

      return response.data.map((profile) => ({
        id: profile.id,
        name: profile.name,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Sonarr quality profiles');
      throw error;
    }
  }

  /**
   * Get root folders
   */
  async getRootFolders(): Promise<RootFolder[]> {
    try {
      const response = await this.client.get<SonarrRootFolder[]>('/api/v3/rootfolder');

      return response.data.map((folder) => ({
        id: folder.id,
        path: folder.path,
        freeSpace: folder.freeSpace,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Sonarr root folders');
      throw error;
    }
  }

  /**
   * Get all series from Sonarr
   */
  async getSeries(): Promise<SonarrSeries[]> {
    try {
      logger.debug('Fetching all series from Sonarr');

      const response = await this.client.get<SonarrSeries[]>('/api/v3/series');

      logger.debug({ count: response.data.length }, 'Sonarr series fetched');

      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Sonarr series');
      throw error;
    }
  }

  /**
   * Get a specific series by ID from Sonarr
   */
  async getSeriesById(id: number): Promise<SonarrSeries | null> {
    try {
      logger.debug({ id }, 'Fetching series from Sonarr by ID');

      const response = await this.client.get<SonarrSeries>(`/api/v3/series/${id}`);

      return response.data;
    } catch (error) {
      // 404 means series not found
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.status === 404) {
          logger.debug({ id }, 'Series not found in Sonarr');
          return null;
        }
      }

      logger.error({ error, id }, 'Failed to fetch Sonarr series by ID');
      throw error;
    }
  }

  /**
   * Get a series by TVDB ID from Sonarr
   */
  async getSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries | null> {
    try {
      logger.debug({ tvdbId }, 'Fetching series from Sonarr by TVDB ID');

      // Get all series and find by TVDB ID
      const allSeries = await this.getSeries();
      const series = allSeries.find((s) => s.tvdbId === tvdbId);

      if (series) {
        logger.debug({ tvdbId, title: series.title }, 'Found series in Sonarr');
      } else {
        logger.debug({ tvdbId }, 'Series not found in Sonarr');
      }

      return series || null;
    } catch (error) {
      logger.error({ error, tvdbId }, 'Failed to fetch Sonarr series by TVDB ID');
      throw error;
    }
  }

  /**
   * Get all episodes for a series
   * Returns episodes grouped by season with file availability status
   */
  async getEpisodesBySeries(seriesId: number): Promise<SonarrEpisode[]> {
    try {
      logger.debug({ seriesId }, 'Fetching episodes from Sonarr');

      const response = await this.client.get<SonarrEpisode[]>('/api/v3/episode', {
        params: { seriesId },
      });

      logger.debug({ seriesId, episodeCount: response.data.length }, 'Sonarr episodes fetched');

      return response.data;
    } catch (error) {
      logger.error({ error, seriesId }, 'Failed to fetch Sonarr episodes');
      throw error;
    }
  }

  /**
   * Get available episodes grouped by season
   * Returns only episodes that have files (hasFile: true)
   */
  async getAvailableEpisodesBySeason(seriesId: number): Promise<Record<number, number[]>> {
    try {
      const episodes = await this.getEpisodesBySeries(seriesId);

      // Filter for episodes with files and group by season
      const episodesBySeason: Record<number, number[]> = {};

      for (const episode of episodes) {
        if (episode.hasFile && episode.seasonNumber > 0) {
          // Exclude specials (season 0)
          if (!episodesBySeason[episode.seasonNumber]) {
            episodesBySeason[episode.seasonNumber] = [];
          }
          episodesBySeason[episode.seasonNumber].push(episode.episodeNumber);
        }
      }

      // Sort episode numbers within each season
      for (const seasonNum in episodesBySeason) {
        episodesBySeason[seasonNum].sort((a, b) => a - b);
      }

      logger.debug(
        { seriesId, seasons: Object.keys(episodesBySeason).length },
        'Available episodes grouped by season'
      );

      return episodesBySeason;
    } catch (error) {
      logger.error({ error, seriesId }, 'Failed to get available episodes by season');
      throw error;
    }
  }
}
