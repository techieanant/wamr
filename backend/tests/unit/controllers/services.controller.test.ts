import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  listServices,
  getService,
  createService,
  updateService,
  deleteService,
  testConnection,
  getServiceMetadata,
} from '../../../src/api/controllers/services.controller';
import { Request, Response, NextFunction } from 'express';
import { mediaServiceConfigRepository } from '../../../src/repositories/media-service-config.repository';
import { encryptionService } from '../../../src/services/encryption/encryption.service';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/repositories/media-service-config.repository', () => ({
  mediaServiceConfigRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    validateUniquePriority: vi.fn(),
  },
}));
vi.mock('../../../src/services/encryption/encryption.service', () => ({
  encryptionService: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
}));
vi.mock('../../../src/services/integrations/radarr.client', () => ({
  RadarrClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn(),
    getQualityProfiles: vi.fn(),
    getRootFolders: vi.fn(),
  })),
}));
vi.mock('../../../src/services/integrations/sonarr.client', () => ({
  SonarrClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn(),
    getQualityProfiles: vi.fn(),
    getRootFolders: vi.fn(),
  })),
}));
vi.mock('../../../src/services/integrations/overseerr.client', () => ({
  OverseerrClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn(),
  })),
}));
vi.mock('../../../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Services Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      params: {},
      body: {},
    };
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('listServices', () => {
    it('should return all services', async () => {
      const mockServices = [
        {
          id: 1,
          name: 'Radarr Service',
          serviceType: 'radarr',
          baseUrl: 'http://radarr.example.com',
          apiKeyEncrypted: 'encrypted-key',
          enabled: true,
          priorityOrder: 1,
          maxResults: 5,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
      ];

      (mediaServiceConfigRepository.findAll as Mock).mockResolvedValue(mockServices);

      await listServices(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findAll).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        services: [
          {
            id: 1,
            name: 'Radarr Service',
            serviceType: 'radarr',
            baseUrl: 'http://radarr.example.com',
            enabled: true,
            priorityOrder: 1,
            maxResults: 5,
            qualityProfileId: 1,
            rootFolderPath: '/movies',
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      });
    });

    it('should test Overseerr connection successfully', async () => {
      const mockResult = { success: true, version: '1.0.0' };
      mockRequest.body = {
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKey: 'test-key',
      };

      const { OverseerrClient } = await import(
        '../../../src/services/integrations/overseerr.client'
      );
      const mockClientInstance = {
        testConnection: vi.fn().mockResolvedValue(mockResult),
      };
      (OverseerrClient as any).mockImplementation(() => mockClientInstance);

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.testConnection).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('getService', () => {
    it('should return service by id', async () => {
      const mockService = {
        id: 1,
        name: 'Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };
      mockRequest.params = { id: '1' };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);

      await getService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(mockResponse.json).toHaveBeenCalledWith({
        id: 1,
        name: 'Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return 404 when service not found', async () => {
      mockRequest.params = { id: '999' };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(null);

      await getService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service not found',
        message: 'Service with ID 999 does not exist',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (mediaServiceConfigRepository.findById as Mock).mockRejectedValue(error);

      await getService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to get service');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('createService', () => {
    it('should create service successfully', async () => {
      const mockCreatedService = {
        id: 1,
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };
      mockRequest.body = {
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKey: 'api-key',
        priorityOrder: 1,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
      };

      (mediaServiceConfigRepository.validateUniquePriority as Mock).mockResolvedValue(true);
      (encryptionService.encrypt as Mock).mockResolvedValue('encrypted-key');
      (mediaServiceConfigRepository.create as Mock).mockResolvedValue(mockCreatedService);

      await createService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.validateUniquePriority).toHaveBeenCalledWith('radarr', 1);
      expect(encryptionService.encrypt).toHaveBeenCalledWith('api-key');
      expect(mediaServiceConfigRepository.create).toHaveBeenCalledWith({
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
      });
      expect(logger.info).toHaveBeenCalledWith(
        { serviceId: 1, name: 'New Radarr Service' },
        'Service created'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        id: 1,
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return 409 when priority is not unique', async () => {
      mockRequest.body = {
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKey: 'api-key',
        priorityOrder: 1,
      };

      (mediaServiceConfigRepository.validateUniquePriority as Mock).mockResolvedValue(false);

      await createService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.validateUniquePriority).toHaveBeenCalledWith('radarr', 1);
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Priority conflict',
        message: 'Priority 1 is already used by another radarr service',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.body = {
        name: 'New Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKey: 'api-key',
        priorityOrder: 1,
      };

      (mediaServiceConfigRepository.validateUniquePriority as Mock).mockRejectedValue(error);

      await createService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to create service');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateService', () => {
    it('should update service successfully', async () => {
      const mockExistingService = {
        id: 1,
        name: 'Existing Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };
      const mockUpdatedService = {
        ...mockExistingService,
        name: 'Updated Service',
        enabled: false,
        updatedAt: new Date('2023-01-02'),
      };
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        name: 'Updated Service',
        enabled: false,
      };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockExistingService);
      (mediaServiceConfigRepository.update as Mock).mockResolvedValue(mockUpdatedService);

      await updateService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(mediaServiceConfigRepository.update).toHaveBeenCalledWith(1, {
        name: 'Updated Service',
        enabled: false,
      });
      expect(logger.info).toHaveBeenCalledWith(
        { serviceId: 1, name: 'Updated Service' },
        'Service updated'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        id: 1,
        name: 'Updated Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        enabled: false,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      });
    });

    it('should encrypt new API key when provided', async () => {
      const mockExistingService = {
        id: 1,
        name: 'Existing Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'old-encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        apiKey: 'new-api-key',
      };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockExistingService);
      (encryptionService.encrypt as Mock).mockResolvedValue('new-encrypted-key');
      (mediaServiceConfigRepository.update as Mock).mockResolvedValue({
        ...mockExistingService,
        apiKeyEncrypted: 'new-encrypted-key',
      });

      await updateService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(encryptionService.encrypt).toHaveBeenCalledWith('new-api-key');
      expect(mediaServiceConfigRepository.update).toHaveBeenCalledWith(1, {
        apiKeyEncrypted: 'new-encrypted-key',
      });
    });

    it('should return 404 when service not found', async () => {
      mockRequest.params = { id: '999' };
      mockRequest.body = { name: 'Updated Name' };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(null);

      await updateService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service not found',
        message: 'Service with ID 999 does not exist',
      });
    });

    it('should return 409 when priority update conflicts', async () => {
      const mockExistingService = {
        id: 1,
        name: 'Existing Service',
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };
      mockRequest.params = { id: '1' };
      mockRequest.body = { priorityOrder: 2 };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockExistingService);
      (mediaServiceConfigRepository.validateUniquePriority as Mock).mockResolvedValue(false);

      await updateService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.validateUniquePriority).toHaveBeenCalledWith(
        'radarr',
        2,
        1
      );
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Priority conflict',
        message: 'Priority 2 is already used by another radarr service',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Name' };

      (mediaServiceConfigRepository.findById as Mock).mockRejectedValue(error);

      await updateService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to update service');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteService', () => {
    it('should delete service successfully', async () => {
      mockRequest.params = { id: '1' };

      (mediaServiceConfigRepository.delete as Mock).mockResolvedValue(true);

      await deleteService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.delete).toHaveBeenCalledWith(1);
      expect(logger.info).toHaveBeenCalledWith({ serviceId: 1 }, 'Service deleted');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should return 404 when service not found', async () => {
      mockRequest.params = { id: '999' };

      (mediaServiceConfigRepository.delete as Mock).mockResolvedValue(false);

      await deleteService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.delete).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service not found',
        message: 'Service with ID 999 does not exist',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (mediaServiceConfigRepository.delete as Mock).mockRejectedValue(error);

      await deleteService(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to delete service');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('testConnection', () => {
    it('should test Radarr connection successfully', async () => {
      const mockResult = { success: true, version: '4.0.0' };
      mockRequest.body = {
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKey: 'test-key',
      };

      const { RadarrClient } = await import('../../../src/services/integrations/radarr.client');
      const mockClientInstance = {
        testConnection: vi.fn().mockResolvedValue(mockResult),
      };
      (RadarrClient as any).mockImplementation(() => mockClientInstance);

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.testConnection).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should test connection using stored service credentials', async () => {
      const mockService = {
        id: 1,
        serviceType: 'sonarr',
        baseUrl: 'http://sonarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/tv',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockResult = { success: true, version: '3.0.0' };
      mockRequest.body = { serviceId: 1 };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockResolvedValue('decrypted-key');

      const { SonarrClient } = await import('../../../src/services/integrations/sonarr.client');
      const mockClientInstance = {
        testConnection: vi.fn().mockResolvedValue(mockResult),
      };
      (SonarrClient as any).mockImplementation(() => mockClientInstance);

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(encryptionService.decrypt).toHaveBeenCalledWith('encrypted-key');
      expect(mockClientInstance.testConnection).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it('should return 404 when service not found for serviceId', async () => {
      mockRequest.body = { serviceId: 999 };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(null);

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service not found',
        message: 'Service with ID 999 does not exist',
      });
    });

    it('should return 400 for invalid service type', async () => {
      mockRequest.body = {
        serviceType: 'invalid',
        baseUrl: 'http://example.com',
        apiKey: 'test-key',
      };

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid service type',
        message: 'Service type invalid is not supported',
      });
    });

    it('should return 400 when missing required fields', async () => {
      mockRequest.body = { serviceType: 'radarr' };

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required fields',
        message:
          'serviceType, baseUrl, and apiKey are required (or serviceId with stored credentials)',
      });
    });

    it('should override stored credentials with provided values', async () => {
      const mockService = {
        id: 1,
        serviceType: 'radarr',
        baseUrl: 'http://stored.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockResult = { success: true, version: '4.0.0' };
      mockRequest.body = {
        serviceId: 1,
        serviceType: 'sonarr', // Override service type
        baseUrl: 'http://override.example.com', // Override base URL
        apiKey: 'override-key', // Override API key
      };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      // Note: decrypt should not be called since apiKey is provided
      (encryptionService.decrypt as Mock).mockResolvedValue('decrypted-key');

      const { SonarrClient } = await import('../../../src/services/integrations/sonarr.client');
      const mockClientInstance = {
        testConnection: vi.fn().mockResolvedValue(mockResult),
      };
      (SonarrClient as any).mockImplementation(() => mockClientInstance);

      await testConnection(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(encryptionService.decrypt).not.toHaveBeenCalled(); // Should not decrypt since apiKey provided
      expect(mockClientInstance.testConnection).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('getServiceMetadata', () => {
    it('should get Radarr metadata successfully', async () => {
      const mockQualityProfiles = [{ id: 1, name: 'HD-1080p' }];
      const mockRootFolders = [{ path: '/movies', freeSpace: 1000000000 }];
      mockRequest.body = {
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKey: 'test-key',
      };

      const { RadarrClient } = await import('../../../src/services/integrations/radarr.client');
      const mockClientInstance = {
        getQualityProfiles: vi.fn().mockResolvedValue(mockQualityProfiles),
        getRootFolders: vi.fn().mockResolvedValue(mockRootFolders),
      };
      (RadarrClient as any).mockImplementation(() => mockClientInstance);

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getQualityProfiles).toHaveBeenCalled();
      expect(mockClientInstance.getRootFolders).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        qualityProfiles: mockQualityProfiles,
        rootFolders: mockRootFolders,
      });
    });

    it('should return empty object for Overseerr metadata', async () => {
      mockRequest.body = {
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKey: 'test-key',
      };

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({});
    });

    it('should return 400 for invalid service type', async () => {
      mockRequest.body = {
        serviceType: 'invalid',
        baseUrl: 'http://example.com',
        apiKey: 'test-key',
      };

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid service type',
        message: 'Service type invalid is not supported',
      });
    });

    it('should get metadata using stored service credentials', async () => {
      const mockService = {
        id: 1,
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockQualityProfiles = [{ id: 1, name: 'HD-1080p' }];
      const mockRootFolders = [{ path: '/movies', freeSpace: 1000000000 }];
      mockRequest.body = { serviceId: 1 };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockResolvedValue('decrypted-key');

      const { RadarrClient } = await import('../../../src/services/integrations/radarr.client');
      const mockClientInstance = {
        getQualityProfiles: vi.fn().mockResolvedValue(mockQualityProfiles),
        getRootFolders: vi.fn().mockResolvedValue(mockRootFolders),
      };
      (RadarrClient as any).mockImplementation(() => mockClientInstance);

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(encryptionService.decrypt).toHaveBeenCalledWith('encrypted-key');
      expect(mockClientInstance.getQualityProfiles).toHaveBeenCalled();
      expect(mockClientInstance.getRootFolders).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        qualityProfiles: mockQualityProfiles,
        rootFolders: mockRootFolders,
      });
    });

    it('should override stored credentials with provided values for metadata', async () => {
      const mockService = {
        id: 1,
        serviceType: 'radarr',
        baseUrl: 'http://stored.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockQualityProfiles = [{ id: 1, name: 'HD-1080p' }];
      const mockRootFolders = [{ path: '/tv', freeSpace: 1000000000 }];
      mockRequest.body = {
        serviceId: 1,
        serviceType: 'sonarr', // Override service type
        baseUrl: 'http://override.example.com', // Override base URL
        apiKey: 'override-key', // Override API key
      };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      // Note: decrypt should not be called since apiKey is provided
      (encryptionService.decrypt as Mock).mockResolvedValue('decrypted-key');

      const { SonarrClient } = await import('../../../src/services/integrations/sonarr.client');
      const mockClientInstance = {
        getQualityProfiles: vi.fn().mockResolvedValue(mockQualityProfiles),
        getRootFolders: vi.fn().mockResolvedValue(mockRootFolders),
      };
      (SonarrClient as any).mockImplementation(() => mockClientInstance);

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(encryptionService.decrypt).not.toHaveBeenCalled(); // Should not decrypt since apiKey provided
      expect(mockClientInstance.getQualityProfiles).toHaveBeenCalled();
      expect(mockClientInstance.getRootFolders).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        qualityProfiles: mockQualityProfiles,
        rootFolders: mockRootFolders,
      });
    });

    it('should return 404 when service not found for metadata serviceId', async () => {
      mockRequest.body = { serviceId: 999 };

      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(null);

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service not found',
        message: 'Service with ID 999 does not exist',
      });
    });

    it('should return 400 when missing required fields for metadata', async () => {
      mockRequest.body = { serviceType: 'radarr' };

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required fields',
        message:
          'serviceType, baseUrl, and apiKey are required (or serviceId with stored credentials)',
      });
    });

    it('should get Sonarr metadata successfully', async () => {
      const mockQualityProfiles = [{ id: 1, name: 'HD-1080p' }];
      const mockRootFolders = [{ path: '/tv', freeSpace: 1000000000 }];
      mockRequest.body = {
        serviceType: 'sonarr',
        baseUrl: 'http://sonarr.example.com',
        apiKey: 'test-key',
      };

      const { SonarrClient } = await import('../../../src/services/integrations/sonarr.client');
      const mockClientInstance = {
        getQualityProfiles: vi.fn().mockResolvedValue(mockQualityProfiles),
        getRootFolders: vi.fn().mockResolvedValue(mockRootFolders),
      };
      (SonarrClient as any).mockImplementation(() => mockClientInstance);

      await getServiceMetadata(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getQualityProfiles).toHaveBeenCalled();
      expect(mockClientInstance.getRootFolders).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        qualityProfiles: mockQualityProfiles,
        rootFolders: mockRootFolders,
      });
    });
  });
});
