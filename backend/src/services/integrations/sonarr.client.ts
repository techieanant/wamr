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
  hasFile?: boolean;
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
      const response = await this.client.get<SonarrSeries[]>('/api/v3/series/lookup', {
        params: { term: query },
      });

      logger.debug({ query, count: response.data.length }, 'Sonarr series search completed');

      return response.data;
    } catch (error) {
      logger.error({ error, query }, 'Sonarr series search failed');
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
}
