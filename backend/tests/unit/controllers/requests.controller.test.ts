import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  getAllRequests,
  getRequestById,
  deleteRequest,
  updateRequestStatus,
  approveRequest,
  rejectRequest,
} from '../../../src/api/controllers/requests.controller';
import { Request, Response, NextFunction } from 'express';
import { requestHistoryRepository } from '../../../src/repositories/request-history.repository';
import { mediaServiceConfigRepository } from '../../../src/repositories/media-service-config.repository';
import { logger } from '../../../src/config/logger';
import { encryptionService } from '../../../src/services/encryption/encryption.service';
import { whatsappClientService } from '../../../src/services/whatsapp/whatsapp-client.service';
import { webSocketService, SocketEvents } from '../../../src/services/websocket/websocket.service';

// Mock dependencies
vi.mock('../../../src/repositories/request-history.repository', () => ({
  requestHistoryRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByStatus: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../../../src/repositories/media-service-config.repository', () => ({
  mediaServiceConfigRepository: {
    findById: vi.fn(),
  },
}));
vi.mock('../../../src/services/encryption/encryption.service', () => ({
  encryptionService: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
}));
vi.mock('../../../src/services/whatsapp/whatsapp-client.service', () => ({
  whatsappClientService: {
    sendMessage: vi.fn(),
  },
}));
vi.mock('../../../src/services/websocket/websocket.service', () => ({
  webSocketService: {
    emit: vi.fn(),
  },
  SocketEvents: {
    REQUEST_STATUS_UPDATE: 'request_status_update',
  },
}));
vi.mock('../../../src/services/integrations/overseerr.client', () => ({
  OverseerrClient: vi.fn().mockImplementation(() => ({
    getRadarrServers: vi.fn(),
    getSonarrServers: vi.fn(),
    requestMovie: vi.fn(),
    requestSeries: vi.fn(),
  })),
}));
vi.mock('../../../src/services/integrations/radarr.client', () => ({
  RadarrClient: vi.fn().mockImplementation(() => ({
    addMovie: vi.fn(),
  })),
}));
vi.mock('../../../src/services/integrations/sonarr.client', () => ({
  SonarrClient: vi.fn().mockImplementation(() => ({
    addSeries: vi.fn(),
  })),
}));
vi.mock('../../../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Requests Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
      body: {},
    };
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('getAllRequests', () => {
    it('should return all requests without filters', async () => {
      const mockRequests = [
        { id: 1, title: 'Request 1' },
        { id: 2, title: 'Request 2' },
      ];

      (requestHistoryRepository.findAll as Mock).mockResolvedValue(mockRequests);

      await getAllRequests(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findAll).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        requests: mockRequests,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('should filter requests by status', async () => {
      const mockRequests = [{ id: 1, status: 'PENDING' }];
      mockRequest.query = { status: 'PENDING' };

      (requestHistoryRepository.findByStatus as Mock).mockResolvedValue(mockRequests);

      await getAllRequests(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findByStatus).toHaveBeenCalledWith('PENDING');
    });

    it('should handle pagination', async () => {
      const mockRequests = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
      mockRequest.query = { page: '2', limit: '10' };

      (requestHistoryRepository.findAll as Mock).mockResolvedValue(mockRequests);

      await getAllRequests(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        requests: mockRequests.slice(10, 20),
        pagination: {
          page: 2,
          limit: 10,
          total: 100,
          totalPages: 10,
        },
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      (requestHistoryRepository.findAll as Mock).mockRejectedValue(error);

      await getAllRequests(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to get requests');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getRequestById', () => {
    it('should return request by id', async () => {
      const mockRequestData = { id: 1, title: 'Test Request' };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);

      await getRequestById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(1);
      expect(mockResponse.json).toHaveBeenCalledWith(mockRequestData);
    });

    it('should return 400 for invalid request ID', async () => {
      mockRequest.params = { id: 'invalid' };

      await getRequestById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid request ID' });
    });

    it('should return 404 when request not found', async () => {
      mockRequest.params = { id: '999' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(null);

      await getRequestById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockRejectedValue(error);

      await getRequestById(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error, requestId: '1' }, 'Failed to get request');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteRequest', () => {
    it('should delete request successfully', async () => {
      const mockRequestData = { id: 1, title: 'Test Request' };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (requestHistoryRepository.delete as Mock).mockResolvedValue(undefined);

      await deleteRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(1);
      expect(requestHistoryRepository.delete).toHaveBeenCalledWith(1);
      expect(logger.info).toHaveBeenCalledWith(
        { requestId: 1, title: 'Test Request' },
        'Request deleted successfully'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request deleted successfully',
      });
    });

    it('should return 400 for invalid request ID', async () => {
      mockRequest.params = { id: 'invalid' };

      await deleteRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid request ID' });
    });

    it('should return 404 when request not found', async () => {
      mockRequest.params = { id: '999' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(null);

      await deleteRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockRejectedValue(error);

      await deleteRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { error, requestId: '1' },
        'Failed to delete request'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateRequestStatus', () => {
    it('should update request status successfully', async () => {
      const mockRequestData = { id: 1, title: 'Test Request', adminNotes: 'Old notes' };
      mockRequest.params = { id: '1' };
      mockRequest.body = { status: 'APPROVED', adminNotes: 'New notes' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (requestHistoryRepository.update as Mock).mockResolvedValue(undefined);

      await updateRequestStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(1);
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'APPROVED',
        adminNotes: 'New notes',
        updatedAt: expect.any(String),
      });
      expect(logger.info).toHaveBeenCalledWith(
        { requestId: 1, status: 'APPROVED' },
        'Request status updated'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request status updated successfully',
      });
    });

    it('should return 400 for invalid request ID', async () => {
      mockRequest.params = { id: 'invalid' };
      mockRequest.body = { status: 'APPROVED' };

      await updateRequestStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid request ID' });
    });

    it('should return 400 for invalid status', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { status: 'INVALID' };

      await updateRequestStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid status' });
    });

    it('should return 404 when request not found', async () => {
      mockRequest.params = { id: '999' };
      mockRequest.body = { status: 'APPROVED' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(null);

      await updateRequestStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };
      mockRequest.body = { status: 'APPROVED' };

      (requestHistoryRepository.findById as Mock).mockRejectedValue(error);

      await updateRequestStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { error, requestId: '1' },
        'Failed to update request status'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // TODO: Add tests for approveRequest and rejectRequest
  // These are more complex and involve multiple services

  describe('approveRequest', () => {
    it('should return 400 for invalid request ID', async () => {
      mockRequest.params = { id: 'invalid' };

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid request ID' });
    });

    it('should return 404 when request not found', async () => {
      mockRequest.params = { id: '999' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(null);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('should return 400 when request status is not PENDING or FAILED', async () => {
      const mockRequestData = { id: 1, status: 'APPROVED', serviceConfigId: 1 };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Request must be in PENDING or FAILED status to approve',
      });
    });

    it('should return 400 when request has no service configuration', async () => {
      const mockRequestData = { id: 1, status: 'PENDING' };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Request has no service configuration',
      });
    });

    it('should return 400 when service not found or disabled', async () => {
      const mockRequestData = { id: 1, status: 'PENDING', serviceConfigId: 1 };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(null);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mediaServiceConfigRepository.findById).toHaveBeenCalledWith(1);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Service not found or disabled' });
    });

    it('should successfully approve and submit movie request to Overseerr', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'movie',
        tmdbId: 123,
        title: 'Test Movie',
        year: 2023,
        phoneNumberEncrypted: 'encrypted-phone',
      };
      const mockService = {
        id: 1,
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock)
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('1234567890');

      // Import and mock the client
      const { OverseerrClient } = await import(
        '../../../src/services/integrations/overseerr.client'
      );
      const mockClientInstance = {
        getRadarrServers: vi.fn().mockResolvedValue([{ id: 1, isDefault: true }]),
        requestMovie: vi.fn().mockResolvedValue(undefined),
      };
      (OverseerrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getRadarrServers).toHaveBeenCalled();
      expect(mockClientInstance.requestMovie).toHaveBeenCalledWith({
        mediaId: 123,
        serverId: 1,
        profileId: 1,
        rootFolder: '/movies',
      });
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'SUBMITTED',
        submittedAt: expect.any(String),
        errorMessage: null,
        updatedAt: expect.any(String),
      });
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        expect.stringContaining('approved')
      );
      expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_STATUS_UPDATE, {
        requestId: 1,
        status: 'SUBMITTED',
        previousStatus: 'PENDING',
        timestamp: expect.any(String),
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request approved and submitted successfully',
      });
    });

    it('should successfully approve and submit series request to Overseerr', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'series',
        tmdbId: 456,
        title: 'Test Series',
        year: 2023,
        phoneNumberEncrypted: 'encrypted-phone',
      };
      const mockService = {
        id: 1,
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock)
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('1234567890');

      // Import and mock the client
      const { OverseerrClient } = await import(
        '../../../src/services/integrations/overseerr.client'
      );
      const mockClientInstance = {
        getSonarrServers: vi.fn().mockResolvedValue([{ id: 2, isDefault: true }]),
        requestSeries: vi.fn().mockResolvedValue(undefined),
      };
      (OverseerrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getSonarrServers).toHaveBeenCalled();
      expect(mockClientInstance.requestSeries).toHaveBeenCalledWith({
        mediaId: 456,
        serverId: 2,
        profileId: 1,
        rootFolder: '/tv',
      });
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'SUBMITTED',
        submittedAt: expect.any(String),
        errorMessage: null,
        updatedAt: expect.any(String),
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request approved and submitted successfully',
      });
    });

    it('should successfully approve and submit movie request to Radarr', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'movie',
        tmdbId: 123,
        title: 'Test Movie',
        year: 2023,
        phoneNumberEncrypted: 'encrypted-phone',
      };
      const mockService = {
        id: 1,
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        qualityProfileId: 2,
        rootFolderPath: '/custom/movies',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock)
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('1234567890');

      // Import and mock the client
      const { RadarrClient } = await import('../../../src/services/integrations/radarr.client');
      const mockClientInstance = {
        addMovie: vi.fn().mockResolvedValue(undefined),
      };
      (RadarrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.addMovie).toHaveBeenCalledWith({
        tmdbId: 123,
        title: 'Test Movie',
        year: 2023,
        titleSlug: 'test-movie-123',
        qualityProfileId: 2,
        rootFolderPath: '/custom/movies',
        monitored: true,
        searchForMovie: true,
      });
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'SUBMITTED',
        submittedAt: expect.any(String),
        errorMessage: null,
        updatedAt: expect.any(String),
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request approved and submitted successfully',
      });
    });

    it('should successfully approve and submit series request to Sonarr', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'series',
        tvdbId: 789,
        title: 'Test Series',
        year: 2023,
        phoneNumberEncrypted: 'encrypted-phone',
      };
      const mockService = {
        id: 1,
        serviceType: 'sonarr',
        baseUrl: 'http://sonarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        qualityProfileId: 3,
        rootFolderPath: '/custom/tv',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock)
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('1234567890');

      // Import and mock the client
      const { SonarrClient } = await import('../../../src/services/integrations/sonarr.client');
      const mockClientInstance = {
        addSeries: vi.fn().mockResolvedValue(undefined),
      };
      (SonarrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.addSeries).toHaveBeenCalledWith({
        tvdbId: 789,
        title: 'Test Series',
        year: 2023,
        titleSlug: 'test-series-789',
        qualityProfileId: 3,
        rootFolderPath: '/custom/tv',
        monitored: true,
        searchForMissingEpisodes: true,
      });
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'SUBMITTED',
        submittedAt: expect.any(String),
        errorMessage: null,
        updatedAt: expect.any(String),
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request approved and submitted successfully',
      });
    });

    it('should handle Overseerr with no default Radarr server', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'movie',
        tmdbId: 123,
        title: 'Test Movie',
      };
      const mockService = {
        id: 1,
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockReturnValue('api-key');

      // Import and mock the client
      const { OverseerrClient } = await import(
        '../../../src/services/integrations/overseerr.client'
      );
      const mockClientInstance = {
        getRadarrServers: vi.fn().mockResolvedValue([]), // No servers
      };
      (OverseerrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getRadarrServers).toHaveBeenCalled();
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'FAILED',
        errorMessage: 'No Radarr server configured in Overseerr',
        updatedAt: expect.any(String),
      });
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should handle Overseerr with no default Sonarr server', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'series',
        tmdbId: 456,
        title: 'Test Series',
      };
      const mockService = {
        id: 1,
        serviceType: 'overseerr',
        baseUrl: 'http://overseerr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockReturnValue('api-key');

      // Import and mock the client
      const { OverseerrClient } = await import(
        '../../../src/services/integrations/overseerr.client'
      );
      const mockClientInstance = {
        getSonarrServers: vi.fn().mockResolvedValue([]), // No servers
      };
      (OverseerrClient as any).mockImplementation(() => mockClientInstance);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockClientInstance.getSonarrServers).toHaveBeenCalled();
      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'FAILED',
        errorMessage: 'No Sonarr server configured in Overseerr',
        updatedAt: expect.any(String),
      });
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should handle Radarr request with missing TMDB ID', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'movie',
        title: 'Test Movie',
        // Missing tmdbId
      };
      const mockService = {
        id: 1,
        serviceType: 'radarr',
        baseUrl: 'http://radarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockReturnValue('api-key');

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'FAILED',
        errorMessage: 'Missing TMDB ID for movie request',
        updatedAt: expect.any(String),
      });
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should handle Sonarr request with missing TVDB ID', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        serviceConfigId: 1,
        mediaType: 'series',
        title: 'Test Series',
        // Missing tvdbId
      };
      const mockService = {
        id: 1,
        serviceType: 'sonarr',
        baseUrl: 'http://sonarr.example.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: true,
      };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (mediaServiceConfigRepository.findById as Mock).mockResolvedValue(mockService);
      (encryptionService.decrypt as Mock).mockReturnValue('api-key');

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'FAILED',
        errorMessage: 'Missing TVDB ID for series request',
        updatedAt: expect.any(String),
      });
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockRejectedValue(error);

      await approveRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { error, requestId: '1' },
        'Failed to approve request'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('rejectRequest', () => {
    it('should return 400 for invalid request ID', async () => {
      mockRequest.params = { id: 'invalid' };

      await rejectRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid request ID' });
    });

    it('should return 404 when request not found', async () => {
      mockRequest.params = { id: '999' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(null);

      await rejectRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.findById).toHaveBeenCalledWith(999);
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Request not found' });
    });

    it('should return 400 when request status is not PENDING or FAILED', async () => {
      const mockRequestData = { id: 1, status: 'APPROVED' };
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);

      await rejectRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Request must be in PENDING or FAILED status to reject',
      });
    });

    it('should successfully reject request', async () => {
      const mockRequestData = {
        id: 1,
        status: 'PENDING',
        title: 'Test Movie',
        mediaType: 'movie',
        year: 2023,
        phoneNumberEncrypted: 'encrypted-phone',
      };
      mockRequest.params = { id: '1' };
      mockRequest.body = { reason: 'Not available' };

      (requestHistoryRepository.findById as Mock).mockResolvedValue(mockRequestData);
      (requestHistoryRepository.update as Mock).mockResolvedValue(undefined);
      (encryptionService.decrypt as Mock).mockReturnValue('1234567890');

      await rejectRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(requestHistoryRepository.update).toHaveBeenCalledWith(1, {
        status: 'REJECTED',
        adminNotes: 'Not available',
        updatedAt: expect.any(String),
      });
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        expect.stringContaining('declined')
      );
      expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_STATUS_UPDATE, {
        requestId: 1,
        status: 'REJECTED',
        previousStatus: 'PENDING',
        timestamp: expect.any(String),
      });
      expect(logger.info).toHaveBeenCalledWith(
        { requestId: 1, title: 'Test Movie' },
        'Request rejected'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Request rejected successfully',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { id: '1' };

      (requestHistoryRepository.findById as Mock).mockRejectedValue(error);

      await rejectRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        { error, requestId: '1' },
        'Failed to reject request'
      );
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
