import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/notifications/admin-notification.service.js', () => ({
  adminNotificationService: {
    getConfig: vi.fn(),
    isConfigured: vi.fn(),
    setPhone: vi.fn(),
    setEnabled: vi.fn(),
    sendTestNotification: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/contact.repository.js', () => ({
  contactRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/whatsapp-connection.repository.js', () => ({
  whatsappConnectionRepository: {
    getActive: vi.fn(),
  },
}));

vi.mock('../../../src/services/encryption/encryption.service.js', () => ({
  encryptionService: {
    decrypt: vi.fn(),
  },
}));

vi.mock('../../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import * as adminNotificationController from '../../../src/api/controllers/admin-notification.controller.js';
import { adminNotificationService } from '../../../src/services/notifications/admin-notification.service.js';
import { contactRepository } from '../../../src/repositories/contact.repository.js';
import { whatsappConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository.js';
import { encryptionService } from '../../../src/services/encryption/encryption.service.js';

describe('AdminNotificationController', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('getAdminNotificationConfig', () => {
    it('should return admin notification config successfully', async () => {
      const mockConfig = {
        phoneNumber: '1234567890',
        countryCode: '+1',
        enabled: true,
      };

      (adminNotificationService.getConfig as any).mockResolvedValue(mockConfig);
      (adminNotificationService.isConfigured as any).mockResolvedValue(true);
      (whatsappConnectionRepository.getActive as any).mockResolvedValue({
        id: 1,
        status: 'CONNECTED',
      });

      await adminNotificationController.getAdminNotificationConfig(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          phoneNumber: '****7890',
          countryCode: '+1',
          enabled: true,
          isConfigured: true,
          whatsappConnected: true,
        },
      });
    });

    it('should return null phone when not configured', async () => {
      const mockConfig = {
        phoneNumber: null,
        countryCode: null,
        enabled: false,
      };

      (adminNotificationService.getConfig as any).mockResolvedValue(mockConfig);
      (adminNotificationService.isConfigured as any).mockResolvedValue(false);
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(null);

      await adminNotificationController.getAdminNotificationConfig(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          phoneNumber: null,
          countryCode: null,
          enabled: false,
          isConfigured: false,
          whatsappConnected: false,
        },
      });
    });

    it('should call next with error on failure', async () => {
      const error = new Error('Database error');
      (adminNotificationService.getConfig as any).mockRejectedValue(error);

      await adminNotificationController.getAdminNotificationConfig(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('setAdminNotificationPhone', () => {
    it('should save phone number successfully', async () => {
      mockRequest.body = {
        phoneNumber: '1234567890',
        countryCode: '+1',
      };

      (adminNotificationService.setPhone as any).mockResolvedValue({
        phoneNumber: '1234567890',
        countryCode: '+1',
        fullNumber: '+11234567890',
      });

      await adminNotificationController.setAdminNotificationPhone(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(adminNotificationService.setPhone).toHaveBeenCalledWith('1234567890', '+1');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin notification phone number updated',
      });
    });

    it('should save phone from contact id', async () => {
      mockRequest.body = {
        contactId: 1,
      };

      (contactRepository.findById as any).mockResolvedValue({
        id: 1,
        phoneNumberEncrypted: 'encrypted-phone',
        name: 'John Doe',
      });
      (encryptionService.decrypt as any).mockReturnValue('+11234567890');
      (adminNotificationService.setPhone as any).mockResolvedValue({
        phoneNumber: '1234567890',
        countryCode: '+1',
        fullNumber: '+11234567890',
      });

      await adminNotificationController.setAdminNotificationPhone(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin notification phone number updated',
      });
    });

    it('should return 404 when contact not found', async () => {
      mockRequest.body = {
        contactId: 999,
      };

      (contactRepository.findById as any).mockResolvedValue(null);

      await adminNotificationController.setAdminNotificationPhone(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Contact not found',
      });
    });

    it('should return 400 when phone number and country code missing', async () => {
      mockRequest.body = {};

      await adminNotificationController.setAdminNotificationPhone(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Phone number and country code are required',
      });
    });

    it('should call next with error on failure', async () => {
      mockRequest.body = {
        phoneNumber: '1234567890',
        countryCode: '+1',
      };

      const error = new Error('Database error');
      (adminNotificationService.setPhone as any).mockRejectedValue(error);

      await adminNotificationController.setAdminNotificationPhone(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('setAdminNotificationEnabled', () => {
    it('should enable notifications successfully', async () => {
      mockRequest.body = { enabled: true };

      (adminNotificationService.getConfig as any).mockResolvedValue({
        phoneNumber: '1234567890',
        countryCode: '+1',
        enabled: false,
      });
      (whatsappConnectionRepository.getActive as any).mockResolvedValue({
        id: 1,
        status: 'CONNECTED',
      });
      (adminNotificationService.setEnabled as any).mockResolvedValue(undefined);

      await adminNotificationController.setAdminNotificationEnabled(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(adminNotificationService.setEnabled).toHaveBeenCalledWith(true);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin notifications enabled',
      });
    });

    it('should disable notifications successfully', async () => {
      mockRequest.body = { enabled: false };

      (adminNotificationService.setEnabled as any).mockResolvedValue(undefined);

      await adminNotificationController.setAdminNotificationEnabled(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(adminNotificationService.setEnabled).toHaveBeenCalledWith(false);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin notifications disabled',
      });
    });

    it('should return 400 when enabled is not a boolean', async () => {
      mockRequest.body = { enabled: 'true' };

      await adminNotificationController.setAdminNotificationEnabled(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'enabled must be a boolean',
      });
    });

    it('should return 400 when enabling without phone configured', async () => {
      mockRequest.body = { enabled: true };

      (adminNotificationService.getConfig as any).mockResolvedValue({
        phoneNumber: null,
        countryCode: null,
        enabled: false,
      });

      await adminNotificationController.setAdminNotificationEnabled(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please set a phone number before enabling notifications',
      });
    });

    it('should return 400 when enabling without WhatsApp connected', async () => {
      mockRequest.body = { enabled: true };

      (adminNotificationService.getConfig as any).mockResolvedValue({
        phoneNumber: '1234567890',
        countryCode: '+1',
        enabled: false,
      });
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(null);

      await adminNotificationController.setAdminNotificationEnabled(
        mockRequest,
        mockResponse,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'WhatsApp must be connected before enabling notifications',
      });
    });
  });

  describe('sendTestNotification', () => {
    it('should send test notification successfully', async () => {
      (adminNotificationService.sendTestNotification as any).mockResolvedValue({
        success: true,
        message: 'Test notification sent successfully',
      });

      await adminNotificationController.sendTestNotification(mockRequest, mockResponse, mockNext);

      expect(adminNotificationService.sendTestNotification).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Test notification sent successfully',
      });
    });

    it('should handle failed notification', async () => {
      (adminNotificationService.sendTestNotification as any).mockResolvedValue({
        success: false,
        message: 'WhatsApp not connected',
      });

      await adminNotificationController.sendTestNotification(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'WhatsApp not connected',
      });
    });

    it('should call next with error on exception', async () => {
      const error = new Error('WhatsApp error');
      (adminNotificationService.sendTestNotification as any).mockRejectedValue(error);

      await adminNotificationController.sendTestNotification(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
