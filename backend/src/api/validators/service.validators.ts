import { z } from 'zod';

/**
 * Service type enum
 */
const serviceTypeSchema = z.enum(['radarr', 'sonarr', 'overseerr']);

/**
 * URL validation (allows HTTP for localhost/internal IPs, requires HTTPS otherwise)
 */
const urlSchema = z
  .string()
  .url('Invalid URL format')
  .refine(
    (url) => {
      const parsed = new URL(url);
      // Allow HTTP for localhost and private IP ranges
      if (parsed.protocol === 'http:') {
        const hostname = parsed.hostname;
        return (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.16.') ||
          hostname.startsWith('172.17.') ||
          hostname.startsWith('172.18.') ||
          hostname.startsWith('172.19.') ||
          hostname.startsWith('172.2') ||
          hostname.startsWith('172.3')
        );
      }
      return true;
    },
    {
      message: 'HTTPS is required for external URLs',
    }
  );

/**
 * Create service configuration validator
 */
export const createServiceConfigSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Name must be at least 3 characters')
      .max(100, 'Name must not exceed 100 characters'),
    serviceType: serviceTypeSchema,
    baseUrl: urlSchema,
    apiKey: z
      .string()
      .min(20, 'API key must be at least 20 characters')
      .max(200, 'API key must not exceed 200 characters'),
    enabled: z.boolean().optional().default(true),
    priorityOrder: z
      .number()
      .int('Priority must be an integer')
      .min(1, 'Priority must be between 1 and 5')
      .max(5, 'Priority must be between 1 and 5'),
    maxResults: z
      .number()
      .int('Max results must be an integer')
      .min(1, 'Max results must be at least 1')
      .max(20, 'Max results must not exceed 20')
      .optional()
      .default(5),
    // Radarr/Sonarr specific fields (not applicable for Overseerr)
    qualityProfileId: z.number().int().positive().optional(),
    rootFolderPath: z.string().min(1).optional(),
  })
  .refine(
    (data) => {
      // Radarr and Sonarr require qualityProfileId and rootFolderPath
      if (data.serviceType === 'radarr' || data.serviceType === 'sonarr') {
        return data.qualityProfileId !== undefined && data.rootFolderPath !== undefined;
      }
      return true;
    },
    {
      message: 'qualityProfileId and rootFolderPath are required for Radarr and Sonarr services',
      path: ['qualityProfileId'],
    }
  );

/**
 * Update service configuration validator (all fields optional except those being updated)
 */
export const updateServiceConfigSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Name must be at least 3 characters')
      .max(100, 'Name must not exceed 100 characters')
      .optional(),
    baseUrl: urlSchema.optional(),
    apiKey: z
      .string()
      .min(20, 'API key must be at least 20 characters')
      .max(200, 'API key must not exceed 200 characters')
      .optional(),
    enabled: z.boolean().optional(),
    priorityOrder: z
      .number()
      .int('Priority must be an integer')
      .min(1, 'Priority must be between 1 and 5')
      .max(5, 'Priority must be between 1 and 5')
      .optional(),
    maxResults: z
      .number()
      .int('Max results must be an integer')
      .min(1, 'Max results must be at least 1')
      .max(20, 'Max results must not exceed 20')
      .optional(),
    // Radarr/Sonarr specific fields (not applicable for Overseerr)
    qualityProfileId: z.number().int().positive().optional(),
    rootFolderPath: z.string().min(1).optional(),
  })
  .strict();

/**
 * Test connection validator
 * Either provide serviceId to use stored credentials,
 * or provide serviceType, baseUrl, and apiKey for a new connection
 */
export const testConnectionSchema = z
  .object({
    serviceId: z.number().int().positive().optional(),
    serviceType: serviceTypeSchema.optional(),
    baseUrl: urlSchema.optional(),
    apiKey: z
      .string()
      .min(20, 'API key must be at least 20 characters')
      .max(200, 'API key must not exceed 200 characters')
      .optional(),
  })
  .refine(
    (data) => {
      // Either serviceId is provided, or all three fields (serviceType, baseUrl, apiKey)
      if (data.serviceId) return true;
      return data.serviceType && data.baseUrl && data.apiKey;
    },
    {
      message: 'Either provide serviceId, or all of serviceType, baseUrl, and apiKey',
    }
  );

/**
 * Service ID parameter validator
 */
export const serviceIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Service ID must be a number').transform(Number),
});

/**
 * Get service metadata validator (for fetching quality profiles, root folders, etc.)
 * Either provide serviceId to use stored credentials,
 * or provide serviceType, baseUrl, and apiKey for a new connection
 */
export const getServiceMetadataSchema = z
  .object({
    serviceId: z.number().int().positive().optional(),
    serviceType: serviceTypeSchema.optional(),
    baseUrl: urlSchema.optional(),
    apiKey: z
      .string()
      .min(20, 'API key must be at least 20 characters')
      .max(200, 'API key must not exceed 200 characters')
      .optional(),
  })
  .refine(
    (data) => {
      // Either serviceId is provided, or all three fields (serviceType, baseUrl, apiKey)
      if (data.serviceId) return true;
      return data.serviceType && data.baseUrl && data.apiKey;
    },
    {
      message: 'Either provide serviceId, or all of serviceType, baseUrl, and apiKey',
    }
  );
