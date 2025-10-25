/**
 * Service Configuration Types
 * Request/response types for service configuration API
 */

import type { ServiceType } from '../models/media-service-config.model.js';

/**
 * Request to create a new service configuration
 */
export interface CreateServiceConfigRequest {
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  apiKey: string; // Plain text API key (will be encrypted)
  enabled?: boolean;
  priorityOrder: number;
  maxResults?: number;
  // Radarr/Sonarr specific (not applicable for Overseerr)
  qualityProfileId?: number;
  rootFolderPath?: string;
}

/**
 * Request to update an existing service configuration
 */
export interface UpdateServiceConfigRequest {
  name?: string;
  baseUrl?: string;
  apiKey?: string; // Plain text API key (will be encrypted if provided)
  enabled?: boolean;
  priorityOrder?: number;
  maxResults?: number;
  // Radarr/Sonarr specific (not applicable for Overseerr)
  qualityProfileId?: number;
  rootFolderPath?: string;
}

/**
 * Service configuration response (without sensitive data)
 */
export interface ServiceConfigResponse {
  id: number;
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  enabled: boolean;
  priorityOrder: number;
  maxResults: number;
  // Radarr/Sonarr specific (null for Overseerr)
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Connection test request
 * Either provide serviceType/baseUrl/apiKey for a new service,
 * or provide serviceId to use stored credentials
 */
export interface TestConnectionRequest {
  serviceId?: number; // Use stored credentials if provided
  serviceType?: ServiceType;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Connection test response
 */
export interface TestConnectionResponse {
  success: boolean;
  message: string;
  version?: string; // Service version if successful
  serverName?: string; // Server name if available
}

/**
 * List services response
 */
export interface ListServicesResponse {
  services: ServiceConfigResponse[];
  total: number;
}

/**
 * Quality profile from Radarr/Sonarr
 */
export interface QualityProfile {
  id: number;
  name: string;
}

/**
 * Root folder from Radarr/Sonarr
 */
export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

/**
 * Service metadata response (quality profiles, root folders, etc.)
 */
export interface ServiceMetadataResponse {
  qualityProfiles?: QualityProfile[];
  rootFolders?: RootFolder[];
}
