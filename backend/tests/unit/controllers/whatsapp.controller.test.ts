import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  getStatus,
  connect,
  disconnect,
  restart,
  updateMessageFilter,
  updateAutoApprovalMode,
  updateExceptions,
} from '../../../src/api/controllers/whatsapp.controller';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/services/whatsapp/whatsapp-client.service', () => ({
  whatsappClientService: {
    isClientInitializing: vi.fn(),
    isReady: vi.fn(),
    getPhoneNumber: vi.fn(),
    initialize: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock('../../../src/repositories/whatsapp-connection.repository', () => ({
  whatsappConnectionRepository: {
    getActive: vi.fn(),
    findAll: vi.fn(),
    upsert: vi.fn(),
    updateMessageFilter: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../../../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../../src/api/validators/whatsapp.validators', () => ({
  messageFilterSchema: {
    safeParse: vi.fn(),
  },
}));

// Import mocked services
import { whatsappClientService } from '../../../src/services/whatsapp/whatsapp-client.service';
import { whatsappConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository';
import { messageFilterSchema } from '../../../src/api/validators/whatsapp.validators';

describe('WhatsApp Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
    };
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('getStatus', () => {
    it('should return LOADING status when client is initializing', async () => {
      (whatsappClientService.isClientInitializing as Mock).mockReturnValue(true);

      await getStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappClientService.isClientInitializing).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'LOADING',
        isConnected: false,
        phoneNumber: null,
        lastConnectedAt: null,
      });
    });

    it('should return status for active connection', async () => {
      const mockConnection = {
        id: 1,
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-01'),
        filterType: 'contains',
        filterValue: 'movie',
        autoApprovalMode: 'manual',
      };

      (whatsappClientService.isClientInitializing as Mock).mockReturnValue(false);
      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(mockConnection);
      (whatsappClientService.isReady as Mock).mockReturnValue(true);
      (whatsappClientService.getPhoneNumber as Mock).mockReturnValue('+1234567890');

      await getStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.getActive).toHaveBeenCalled();
      expect(whatsappClientService.isReady).toHaveBeenCalled();
      expect(whatsappClientService.getPhoneNumber).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'CONNECTED',
        isConnected: true,
        phoneNumber: '+1234567890',
        lastConnectedAt: mockConnection.lastConnectedAt,
        filterType: 'contains',
        filterValue: 'movie',
        autoApprovalMode: 'manual',
      });
    });

    it('should return status for most recent connection when no active connection', async () => {
      const mockConnections = [
        {
          id: 1,
          status: 'CONNECTED',
          lastConnectedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
          filterType: 'contains',
          filterValue: 'movie',
          autoApprovalMode: 'manual',
        },
        {
          id: 2,
          status: 'DISCONNECTED',
          lastConnectedAt: new Date('2023-01-02'),
          updatedAt: new Date('2023-01-02'),
          filterType: null,
          filterValue: null,
          autoApprovalMode: 'manual',
        },
      ];

      (whatsappClientService.isClientInitializing as Mock).mockReturnValue(false);
      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(null);
      (whatsappConnectionRepository.findAll as Mock).mockResolvedValue(mockConnections);
      (whatsappClientService.isReady as Mock).mockReturnValue(true);
      (whatsappClientService.getPhoneNumber as Mock).mockReturnValue('+1234567890');

      await getStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.findAll).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'DISCONNECTED',
        isConnected: false,
        phoneNumber: null,
        lastConnectedAt: mockConnections[0].lastConnectedAt,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'manual',
      });
    });

    it('should return DISCONNECTED when no connections exist', async () => {
      (whatsappClientService.isClientInitializing as Mock).mockReturnValue(false);
      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(null);
      (whatsappConnectionRepository.findAll as Mock).mockResolvedValue([]);

      await getStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'DISCONNECTED',
        isConnected: false,
        phoneNumber: null,
        lastConnectedAt: null,
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      (whatsappClientService.isClientInitializing as Mock).mockReturnValue(false);
      (whatsappConnectionRepository.getActive as Mock).mockRejectedValue(error);

      await getStatus(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to get WhatsApp status');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('connect', () => {
    it('should return success when already connected', async () => {
      (whatsappClientService.isReady as Mock).mockReturnValue(true);

      await connect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappClientService.isReady).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp is already connected',
      });
    });

    it('should initiate connection successfully', async () => {
      (whatsappClientService.isReady as Mock).mockReturnValue(false);
      (whatsappClientService.initialize as Mock).mockResolvedValue(undefined);

      await connect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.upsert).toHaveBeenCalledWith({
        phoneNumberHash: '',
        status: 'CONNECTING',
      });
      expect(whatsappClientService.initialize).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp connection initiated. Please scan QR code.',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Connection error');
      (whatsappClientService.isReady as Mock).mockReturnValue(false);
      (whatsappConnectionRepository.upsert as Mock).mockRejectedValue(error);

      await connect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to start WhatsApp connection');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      (whatsappClientService.logout as Mock).mockResolvedValue(undefined);

      await disconnect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappClientService.logout).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp disconnected successfully',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Disconnect error');
      (whatsappClientService.logout as Mock).mockRejectedValue(error);

      await disconnect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to disconnect WhatsApp');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('restart', () => {
    it('should restart connection successfully', async () => {
      (whatsappClientService.logout as Mock).mockResolvedValue(undefined);
      (whatsappClientService.initialize as Mock).mockResolvedValue(undefined);

      await restart(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappClientService.logout).toHaveBeenCalled();
      expect(whatsappClientService.initialize).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp connection restarted. Please scan QR code if needed.',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Restart error');
      (whatsappClientService.logout as Mock).mockRejectedValue(error);

      await restart(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to restart WhatsApp connection');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateMessageFilter', () => {
    it('should update message filter successfully', async () => {
      const filterData = {
        filterType: 'contains',
        filterValue: 'movie',
      };
      mockRequest.body = filterData;

      const mockUpdatedConnection = {
        id: 1,
        filterType: 'contains',
        filterValue: 'movie',
        processFromSelf: false,
        processGroups: false,
      };

      (messageFilterSchema.safeParse as Mock).mockReturnValue({
        success: true,
        data: filterData,
      });
      (whatsappConnectionRepository.updateMessageFilter as Mock).mockResolvedValue(
        mockUpdatedConnection
      );

      await updateMessageFilter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(messageFilterSchema.safeParse).toHaveBeenCalledWith(filterData);
      expect(whatsappConnectionRepository.updateMessageFilter).toHaveBeenCalledWith(
        'contains',
        'movie',
        {}
      );
      expect(logger.info).toHaveBeenCalledWith(
        { filterType: 'contains', filterValue: 'movie', processFromSelf: undefined, processGroups: undefined },
        'Message filter updated'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Message filter updated successfully',
        filterType: 'contains',
        filterValue: 'movie',
        processFromSelf: false,
        processGroups: false,
      });
    });

    it('should return 400 for invalid filter data', async () => {
      mockRequest.body = { invalid: 'data' };

      (messageFilterSchema.safeParse as Mock).mockReturnValue({
        success: false,
        error: { errors: [{ message: 'Invalid filter type' }] },
      });

      await updateMessageFilter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid filter configuration',
        errors: [{ message: 'Invalid filter type' }],
      });
    });

    it('should return 404 when no connection found', async () => {
      const filterData = {
        filterType: 'contains',
        filterValue: 'movie',
      };
      mockRequest.body = filterData;

      (messageFilterSchema.safeParse as Mock).mockReturnValue({
        success: true,
        data: filterData,
      });
      (whatsappConnectionRepository.updateMessageFilter as Mock).mockResolvedValue(null);

      await updateMessageFilter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No WhatsApp connection found',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Update error');
      mockRequest.body = { filterType: 'contains', filterValue: 'movie' };

      (messageFilterSchema.safeParse as Mock).mockReturnValue({
        success: true,
        data: { filterType: 'contains', filterValue: 'movie' },
      });
      (whatsappConnectionRepository.updateMessageFilter as Mock).mockRejectedValue(error);

      await updateMessageFilter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to update message filter');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateAutoApprovalMode', () => {
    it('should update auto-approval mode successfully', async () => {
      mockRequest.body = { mode: 'auto_approve' };

      const mockConnection = {
        id: 1,
        status: 'CONNECTED',
      };

      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(mockConnection);

      await updateAutoApprovalMode(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.getActive).toHaveBeenCalled();
      expect(whatsappConnectionRepository.update).toHaveBeenCalledWith(1, {
        autoApprovalMode: 'auto_approve',
      });
      expect(logger.info).toHaveBeenCalledWith(
        { mode: 'auto_approve' },
        'Auto-approval mode updated'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Auto-approval mode updated successfully',
        mode: 'auto_approve',
      });
    });

    it('should return 400 for invalid mode', async () => {
      mockRequest.body = { mode: 'invalid_mode' };

      await updateAutoApprovalMode(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        { mode: 'invalid_mode', body: { mode: 'invalid_mode' } },
        'Invalid auto-approval mode received'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid auto-approval mode. Must be: auto_approve, auto_deny, or manual',
      });
    });

    it('should return 404 when no connection found', async () => {
      mockRequest.body = { mode: 'manual' };

      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(null);

      await updateAutoApprovalMode(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No WhatsApp connection found',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Update error');
      mockRequest.body = { mode: 'manual' };

      (whatsappConnectionRepository.getActive as Mock).mockRejectedValue(error);

      await updateAutoApprovalMode(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to update auto-approval mode');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateExceptions', () => {
    beforeEach(() => {
      mockRequest.body = {};
      mockResponse.status.mockReturnThis();
      mockResponse.json.mockReturnThis();
    });

    it('should update exceptions successfully', async () => {
      const mockConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        exceptionsEnabled: true,
        exceptionContacts: ['contact1', 'contact2'],
      };

      mockRequest.body = {
        exceptionsEnabled: true,
        exceptionContacts: ['contact1', 'contact2'],
      };

      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(mockConnection);
      (whatsappConnectionRepository.update as Mock).mockResolvedValue(mockConnection);

      await updateExceptions(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.getActive).toHaveBeenCalled();
      expect(whatsappConnectionRepository.update).toHaveBeenCalledWith(1, {
        exceptionsEnabled: true,
        exceptionContacts: ['contact1', 'contact2'],
      });
      expect(logger.info).toHaveBeenCalledWith(
        { exceptionsEnabled: true, exceptionContactsCount: 2 },
        'Exceptions updated'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Exceptions updated successfully',
        exceptionsEnabled: true,
        exceptionContacts: ['contact1', 'contact2'],
      });
    });

    it('should handle empty exception contacts array', async () => {
      const mockConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        exceptionsEnabled: false,
        exceptionContacts: [],
      };

      mockRequest.body = {
        exceptionsEnabled: false,
        exceptionContacts: [],
      };

      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(mockConnection);
      (whatsappConnectionRepository.update as Mock).mockResolvedValue(mockConnection);

      await updateExceptions(mockRequest as Request, mockResponse as Response, mockNext);

      expect(whatsappConnectionRepository.update).toHaveBeenCalledWith(1, {
        exceptionsEnabled: false,
        exceptionContacts: [],
      });
      expect(logger.info).toHaveBeenCalledWith(
        { exceptionsEnabled: false, exceptionContactsCount: 0 },
        'Exceptions updated'
      );
    });

    it('should return 404 when no connection found', async () => {
      mockRequest.body = {
        exceptionsEnabled: true,
        exceptionContacts: ['contact1'],
      };

      (whatsappConnectionRepository.getActive as Mock).mockResolvedValue(null);

      await updateExceptions(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No WhatsApp connection found',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Update error');
      mockRequest.body = {
        exceptionsEnabled: true,
        exceptionContacts: ['contact1'],
      };

      (whatsappConnectionRepository.getActive as Mock).mockRejectedValue(error);

      await updateExceptions(mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Failed to update exceptions');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
