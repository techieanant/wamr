import type { Request, Response, NextFunction } from 'express';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { encryptionService } from '../../services/encryption/encryption.service.js';
import { RadarrClient } from '../../services/integrations/radarr.client.js';
import { SonarrClient } from '../../services/integrations/sonarr.client.js';
import { OverseerrClient } from '../../services/integrations/overseerr.client.js';
import { logger } from '../../config/logger.js';
import type {
  CreateServiceConfigRequest,
  UpdateServiceConfigRequest,
  ServiceConfigResponse,
  TestConnectionRequest,
} from '../../types/service-config.types.js';
import type { ServiceType } from '../../models/media-service-config.model.js';

/**
 * Get all service configurations
 */
export const listServices = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const services = await mediaServiceConfigRepository.findAll();

    // Map to response format (exclude encrypted API key)
    const response = services.map((service) => ({
      id: service.id,
      name: service.name,
      serviceType: service.serviceType,
      baseUrl: service.baseUrl,
      enabled: service.enabled,
      priorityOrder: service.priorityOrder,
      maxResults: service.maxResults,
      qualityProfileId: service.qualityProfileId,
      rootFolderPath: service.rootFolderPath,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    }));

    res.json({
      services: response,
      total: response.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list services');
    next(error);
  }
};

/**
 * Get service configuration by ID
 */
export const getService = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const service = await mediaServiceConfigRepository.findById(id);

    if (!service) {
      res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${id} does not exist`,
      });
      return;
    }

    const response: ServiceConfigResponse = {
      id: service.id,
      name: service.name,
      serviceType: service.serviceType,
      baseUrl: service.baseUrl,
      enabled: service.enabled,
      priorityOrder: service.priorityOrder,
      maxResults: service.maxResults,
      qualityProfileId: service.qualityProfileId,
      rootFolderPath: service.rootFolderPath,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to get service');
    next(error);
  }
};

/**
 * Create new service configuration
 */
export const createService = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = req.body as CreateServiceConfigRequest;

    // Validate unique priority for service type
    const priorityAvailable = await mediaServiceConfigRepository.validateUniquePriority(
      data.serviceType,
      data.priorityOrder
    );

    if (!priorityAvailable) {
      res.status(409).json({
        error: 'Priority conflict',
        message: `Priority ${data.priorityOrder} is already used by another ${data.serviceType} service`,
      });
      return;
    }

    // Encrypt API key
    const apiKeyEncrypted = await encryptionService.encrypt(data.apiKey);

    // Create service
    const service = await mediaServiceConfigRepository.create({
      name: data.name,
      serviceType: data.serviceType,
      baseUrl: data.baseUrl,
      apiKeyEncrypted,
      enabled: data.enabled ?? true,
      priorityOrder: data.priorityOrder,
      maxResults: data.maxResults ?? 5,
      qualityProfileId: data.qualityProfileId,
      rootFolderPath: data.rootFolderPath,
    });

    logger.info({ serviceId: service.id, name: service.name }, 'Service created');

    const response: ServiceConfigResponse = {
      id: service.id,
      name: service.name,
      serviceType: service.serviceType,
      baseUrl: service.baseUrl,
      enabled: service.enabled,
      priorityOrder: service.priorityOrder,
      maxResults: service.maxResults,
      qualityProfileId: service.qualityProfileId,
      rootFolderPath: service.rootFolderPath,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to create service');
    next(error);
  }
};

/**
 * Update service configuration
 */
export const updateService = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = req.body as UpdateServiceConfigRequest;

    // Check if service exists
    const existing = await mediaServiceConfigRepository.findById(id);
    if (!existing) {
      res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${id} does not exist`,
      });
      return;
    }

    // Validate priority if being updated
    if (data.priorityOrder !== undefined) {
      const priorityAvailable = await mediaServiceConfigRepository.validateUniquePriority(
        existing.serviceType,
        data.priorityOrder,
        id
      );

      if (!priorityAvailable) {
        res.status(409).json({
          error: 'Priority conflict',
          message: `Priority ${data.priorityOrder} is already used by another ${existing.serviceType} service`,
        });
        return;
      }
    }

    // Encrypt API key if provided
    let apiKeyEncrypted: string | undefined;
    if (data.apiKey) {
      apiKeyEncrypted = await encryptionService.encrypt(data.apiKey);
    }

    // Update service
    const service = await mediaServiceConfigRepository.update(id, {
      name: data.name,
      baseUrl: data.baseUrl,
      apiKeyEncrypted,
      enabled: data.enabled,
      priorityOrder: data.priorityOrder,
      maxResults: data.maxResults,
      qualityProfileId: data.qualityProfileId,
      rootFolderPath: data.rootFolderPath,
    });

    if (!service) {
      res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${id} does not exist`,
      });
      return;
    }

    logger.info({ serviceId: service.id, name: service.name }, 'Service updated');

    const response: ServiceConfigResponse = {
      id: service.id,
      name: service.name,
      serviceType: service.serviceType,
      baseUrl: service.baseUrl,
      enabled: service.enabled,
      priorityOrder: service.priorityOrder,
      maxResults: service.maxResults,
      qualityProfileId: service.qualityProfileId,
      rootFolderPath: service.rootFolderPath,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Failed to update service');
    next(error);
  }
};

/**
 * Delete service configuration
 */
export const deleteService = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);

    const deleted = await mediaServiceConfigRepository.delete(id);

    if (!deleted) {
      res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${id} does not exist`,
      });
      return;
    }

    logger.info({ serviceId: id }, 'Service deleted');

    res.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete service');
    next(error);
  }
};

/**
 * Test connection to service
 */
export const testConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { serviceType, baseUrl, apiKey, serviceId } = req.body as TestConnectionRequest;

    let finalApiKey = apiKey;
    let finalBaseUrl = baseUrl;
    let finalServiceType = serviceType;

    // If serviceId is provided, use stored credentials
    if (serviceId) {
      const service = await mediaServiceConfigRepository.findById(serviceId);
      if (!service) {
        res.status(404).json({
          error: 'Service not found',
          message: `Service with ID ${serviceId} does not exist`,
        });
        return;
      }

      // Use stored values (allow override with provided values)
      finalServiceType = serviceType || service.serviceType;
      finalBaseUrl = baseUrl || service.baseUrl;

      // Use provided API key if available, otherwise decrypt stored one
      if (!apiKey) {
        finalApiKey = await encryptionService.decrypt(service.apiKeyEncrypted);
      }
    }

    // Validate we have all required fields
    if (!finalServiceType || !finalBaseUrl || !finalApiKey) {
      res.status(400).json({
        error: 'Missing required fields',
        message:
          'serviceType, baseUrl, and apiKey are required (or serviceId with stored credentials)',
      });
      return;
    }

    let result;

    switch (finalServiceType) {
      case 'radarr': {
        const client = new RadarrClient(finalBaseUrl, finalApiKey);
        result = await client.testConnection();
        break;
      }
      case 'sonarr': {
        const client = new SonarrClient(finalBaseUrl, finalApiKey);
        result = await client.testConnection();
        break;
      }
      case 'overseerr': {
        const client = new OverseerrClient(finalBaseUrl, finalApiKey);
        result = await client.testConnection();
        break;
      }
      default:
        res.status(400).json({
          error: 'Invalid service type',
          message: `Service type ${finalServiceType} is not supported`,
        });
        return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Connection test failed');
    next(error);
  }
};

/**
 * Get service metadata (quality profiles, root folders, servers)
 */
export const getServiceMetadata = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { serviceType, baseUrl, apiKey, serviceId } = req.body as {
      serviceId?: number;
      serviceType?: ServiceType;
      baseUrl?: string;
      apiKey?: string;
    };

    let finalApiKey = apiKey;
    let finalBaseUrl = baseUrl;
    let finalServiceType = serviceType;

    // If serviceId is provided, use stored credentials
    if (serviceId) {
      const service = await mediaServiceConfigRepository.findById(serviceId);
      if (!service) {
        res.status(404).json({
          error: 'Service not found',
          message: `Service with ID ${serviceId} does not exist`,
        });
        return;
      }

      // Use stored values (allow override with provided values)
      finalServiceType = serviceType || service.serviceType;
      finalBaseUrl = baseUrl || service.baseUrl;

      // Use provided API key if available, otherwise decrypt stored one
      if (!apiKey) {
        finalApiKey = await encryptionService.decrypt(service.apiKeyEncrypted);
      }
    }

    // Validate we have all required fields
    if (!finalServiceType || !finalBaseUrl || !finalApiKey) {
      res.status(400).json({
        error: 'Missing required fields',
        message:
          'serviceType, baseUrl, and apiKey are required (or serviceId with stored credentials)',
      });
      return;
    }

    let result;

    switch (finalServiceType) {
      case 'radarr': {
        const client = new RadarrClient(finalBaseUrl, finalApiKey);
        const [qualityProfiles, rootFolders] = await Promise.all([
          client.getQualityProfiles(),
          client.getRootFolders(),
        ]);
        result = { qualityProfiles, rootFolders };
        break;
      }
      case 'sonarr': {
        const client = new SonarrClient(finalBaseUrl, finalApiKey);
        const [qualityProfiles, rootFolders] = await Promise.all([
          client.getQualityProfiles(),
          client.getRootFolders(),
        ]);
        result = { qualityProfiles, rootFolders };
        break;
      }
      case 'overseerr': {
        // Overseerr doesn't need metadata - it manages its own Radarr/Sonarr configurations
        result = {};
        break;
      }
      default:
        res.status(400).json({
          error: 'Invalid service type',
          message: `Service type ${serviceType} is not supported`,
        });
        return;
    }

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get service metadata');
    next(error);
  }
};
