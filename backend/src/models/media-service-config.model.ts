/**
 * Media Service Configuration Model
 * Represents Radarr, Sonarr, and Overseerr service configurations
 */

/**
 * Service types supported by the system
 */
export type ServiceType = 'radarr' | 'sonarr' | 'overseerr';

/**
 * Media service configuration status
 */
export type ServiceStatus = 'enabled' | 'disabled';

/**
 * Media service configuration entity
 */
export interface MediaServiceConfiguration {
  id: number;
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  apiKeyEncrypted: string;
  enabled: boolean;
  priorityOrder: number;
  maxResults: number;
  // Radarr/Sonarr specific fields (null for Overseerr)
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create media service configuration (insert)
 */
export interface CreateMediaServiceConfiguration {
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  apiKeyEncrypted: string;
  enabled?: boolean;
  priorityOrder: number;
  maxResults?: number;
  // Radarr/Sonarr specific fields (should be null for Overseerr)
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
}

/**
 * Update media service configuration (partial update)
 */
export interface UpdateMediaServiceConfiguration {
  name?: string;
  baseUrl?: string;
  apiKeyEncrypted?: string;
  enabled?: boolean;
  priorityOrder?: number;
  maxResults?: number;
  // Radarr/Sonarr specific fields (should be null for Overseerr)
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
}

/**
 * Service configuration with decrypted API key (for internal use only)
 */
export interface MediaServiceConfigurationWithApiKey extends MediaServiceConfiguration {
  apiKey: string;
}
