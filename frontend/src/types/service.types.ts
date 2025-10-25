/**
 * Service types
 */
export type ServiceType = 'radarr' | 'sonarr' | 'overseerr';

/**
 * Service configuration
 */
export interface ServiceConfig {
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
 * Create service request
 */
export interface CreateServiceRequest {
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  apiKey: string;
  enabled?: boolean;
  priorityOrder: number;
  maxResults: number;
  // Radarr/Sonarr specific (not applicable for Overseerr)
  qualityProfileId?: number;
  rootFolderPath?: string;
}

/**
 * Update service request
 */
export interface UpdateServiceRequest {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  priorityOrder?: number;
  maxResults?: number;
  // Radarr/Sonarr specific (not applicable for Overseerr)
  qualityProfileId?: number;
  rootFolderPath?: string;
}

/**
 * Test connection request
 * Either provide serviceId to use stored credentials,
 * or provide serviceType, baseUrl, and apiKey for a new connection
 */
export interface TestConnectionRequest {
  serviceId?: number;
  serviceType?: ServiceType;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Test connection response
 */
export interface TestConnectionResponse {
  success: boolean;
  message: string;
  version?: string;
  serverName?: string;
}

/**
 * Quality profile
 */
export interface QualityProfile {
  id: number;
  name: string;
}

/**
 * Root folder
 */
export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

/**
 * Service metadata
 */
export interface ServiceMetadata {
  qualityProfiles?: QualityProfile[];
  rootFolders?: RootFolder[];
}

/**
 * Get metadata request
 * Either provide serviceId to use stored credentials,
 * or provide serviceType, baseUrl, and apiKey for a new connection
 */
export interface GetMetadataRequest {
  serviceId?: number;
  serviceType?: ServiceType;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * List services response
 */
export interface ListServicesResponse {
  services: ServiceConfig[];
  total: number;
}
