import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
vi.mock('../../../src/repositories/admin-user.repository', () => {
  const mockRepo = {
    findById: vi.fn(),
  };
  return {
    AdminUserRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/repositories/whatsapp-connection.repository', () => {
  const mockRepo = {
    findAll: vi.fn(),
  };
  return {
    WhatsAppConnectionRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/repositories/media-service-config.repository', () => {
  const mockRepo = {
    findAll: vi.fn(),
    update: vi.fn(),
  };
  return {
    MediaServiceConfigRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/repositories/request-history.repository', () => {
  const mockRepo = {
    findAll: vi.fn(),
    create: vi.fn(),
  };
  return {
    RequestHistoryRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/repositories/contact.repository', () => {
  const mockRepo = {
    findAll: vi.fn(),
    upsert: vi.fn(),
  };
  return {
    ContactRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/repositories/setting.repository', () => {
  const mockRepo = {
    findAll: vi.fn(),
    upsert: vi.fn(),
  };
  return {
    SettingRepository: vi.fn().mockImplementation(() => mockRepo),
  };
});
vi.mock('../../../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));
vi.mock('../../../src/db', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

// Import controller after mocks are set up
import {
  changePassword,
  exportData,
  importData,
  getSettings,
  updateSetting,
} from '../../../src/api/controllers/settings.controller';
import { logger } from '../../../src/config/logger';
import bcrypt from 'bcrypt';
import { db } from '../../../src/db';

// Get the mock instances
const AdminUserRepository = (await import('../../../src/repositories/admin-user.repository'))
  .AdminUserRepository;
const WhatsAppConnectionRepository = (
  await import('../../../src/repositories/whatsapp-connection.repository')
).WhatsAppConnectionRepository;
const MediaServiceConfigRepository = (
  await import('../../../src/repositories/media-service-config.repository')
).MediaServiceConfigRepository;
const RequestHistoryRepository = (
  await import('../../../src/repositories/request-history.repository')
).RequestHistoryRepository;
const ContactRepository = (await import('../../../src/repositories/contact.repository'))
  .ContactRepository;
const SettingRepository = (await import('../../../src/repositories/setting.repository'))
  .SettingRepository;

const mockAdminUserRepo = new AdminUserRepository() as any;
const mockWhatsAppRepo = new WhatsAppConnectionRepository() as any;
const mockServiceConfigRepo = new MediaServiceConfigRepository() as any;
const mockRequestHistoryRepo = new RequestHistoryRepository() as any;
const mockContactRepo = new ContactRepository() as any;
const mockSettingRepo = new SettingRepository() as any;

describe('Settings Controller', () => {
  let mockRequest: Partial<Request & { user?: { userId: number } }>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
      user: { userId: 1 },
    };
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRequest.body = {
        currentPassword: 'current-pass',
        newPassword: 'new-password-123',
      };

      mockAdminUserRepo.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      (bcrypt.hash as Mock).mockResolvedValue('new-hashed-password');

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockAdminUserRepo.findById).toHaveBeenCalledWith(1);
      expect(bcrypt.compare).toHaveBeenCalledWith('current-pass', 'hashed-password');
      expect(bcrypt.hash).toHaveBeenCalledWith('new-password-123', 10);
      expect(db.update).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        { userId: 1 },
        'Admin password changed successfully'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed successfully',
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should return 400 when passwords are missing', async () => {
      mockRequest.body = {};

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Current password and new password are required',
      });
    });

    it('should return 400 when new password is too short', async () => {
      mockRequest.body = {
        currentPassword: 'current-pass',
        newPassword: 'short',
      };

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    });

    it('should return 404 when user not found', async () => {
      mockRequest.body = {
        currentPassword: 'current-pass',
        newPassword: 'new-password-123',
      };

      mockAdminUserRepo.findById.mockResolvedValue(null);

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found',
      });
    });

    it('should return 401 when current password is incorrect', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRequest.body = {
        currentPassword: 'wrong-pass',
        newPassword: 'new-password-123',
      };

      mockAdminUserRepo.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrong-pass', 'hashed-password');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Current password is incorrect',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.body = {
        currentPassword: 'current-pass',
        newPassword: 'new-password-123',
      };

      mockAdminUserRepo.findById.mockRejectedValue(error);

      await changePassword(mockRequest as any, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Error changing password');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('exportData', () => {
    it('should export all data successfully', async () => {
      const mockWhatsAppConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'connected',
        lastConnectedAt: new Date('2023-01-01'),
        sessionData: 'session-data',
      };
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
      const mockRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          mediaType: 'movie',
          title: 'Test Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: 'radarr',
          serviceConfigId: 1,
          status: 'PENDING',
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
      ];
      const mockContacts = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: 'encrypted-phone',
          contactName: 'Test User',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];
      const mockSettings = [
        {
          id: 1,
          key: 'wamr-ui-theme',
          value: 'dark',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockWhatsAppRepo.findAll.mockResolvedValue([mockWhatsAppConnection]);
      mockServiceConfigRepo.findAll.mockResolvedValue(mockServices);
      mockRequestHistoryRepo.findAll.mockResolvedValue(mockRequests);
      mockContactRepo.findAll.mockResolvedValue(mockContacts);
      mockSettingRepo.findAll.mockResolvedValue(mockSettings);

      await exportData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockWhatsAppRepo.findAll).toHaveBeenCalled();
      expect(mockServiceConfigRepo.findAll).toHaveBeenCalled();
      expect(mockRequestHistoryRepo.findAll).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith({ userId: 1 }, 'Data exported successfully');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          version: '1.1.0',
          exportedAt: expect.any(String),
          data: {
            whatsappConnection: {
              phoneNumberHash: 'hash123',
              status: 'connected',
              lastConnectedAt: mockWhatsAppConnection.lastConnectedAt,
              filterType: undefined,
              filterValue: undefined,
              autoApprovalMode: undefined,
              exceptionsEnabled: undefined,
              exceptionContacts: undefined,
            },
            services: [
              {
                name: 'Radarr Service',
                serviceType: 'radarr',
                baseUrl: 'http://radarr.example.com',
                enabled: true,
                priorityOrder: 1,
                maxResults: 5,
                qualityProfileId: 1,
                rootFolderPath: '/movies',
              },
            ],
            requests: [
              {
                phoneNumberHash: 'hash123',
                phoneNumberEncrypted: undefined,
                contactName: undefined,
                mediaType: 'movie',
                title: 'Test Movie',
                year: 2023,
                tmdbId: 123,
                tvdbId: null,
                serviceType: 'radarr',
                serviceConfigId: 1,
                selectedSeasons: undefined,
                notifiedSeasons: undefined,
                notifiedEpisodes: undefined,
                totalSeasons: undefined,
                status: 'PENDING',
                conversationLog: undefined,
                submittedAt: null,
                errorMessage: null,
                adminNotes: null,
                createdAt: mockRequests[0].createdAt,
                updatedAt: mockRequests[0].updatedAt,
              },
            ],
            contacts: [
              {
                phoneNumberHash: 'hash123',
                phoneNumberEncrypted: 'encrypted-phone',
                contactName: 'Test User',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-01T00:00:00.000Z',
              },
            ],
            settings: {
              'wamr-ui-theme': 'dark',
            },
          },
        },
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await exportData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should handle no WhatsApp connection', async () => {
      mockWhatsAppRepo.findAll.mockResolvedValue([]);
      mockServiceConfigRepo.findAll.mockResolvedValue([]);
      mockRequestHistoryRepo.findAll.mockResolvedValue([]);
      mockContactRepo.findAll.mockResolvedValue([]);
      mockSettingRepo.findAll.mockResolvedValue([]);

      await exportData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          data: expect.objectContaining({
            whatsappConnection: null,
            contacts: [],
            settings: {},
          }),
        }),
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockWhatsAppRepo.findAll.mockRejectedValue(error);

      await exportData(mockRequest as any, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Error exporting data');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('importData', () => {
    it('should import data successfully', async () => {
      const importDataPayload = {
        version: '1.1.0',
        data: {
          services: [
            {
              name: 'Radarr Service',
              serviceType: 'radarr',
              baseUrl: 'http://radarr.example.com',
              enabled: true,
              priorityOrder: 1,
              maxResults: 5,
              qualityProfileId: 1,
              rootFolderPath: '/movies',
            },
          ],
          requests: [
            {
              phoneNumberHash: 'hash123',
              mediaType: 'movie',
              title: 'Test Movie',
              year: 2023,
              tmdbId: 123,
              tvdbId: null,
              serviceType: 'radarr',
              serviceConfigId: 1,
              status: 'PENDING',
              submittedAt: null,
              errorMessage: null,
              adminNotes: null,
            },
          ],
          contacts: [
            {
              phoneNumberHash: 'hash123',
              phoneNumberEncrypted: 'encrypted-phone',
              contactName: 'Test User',
            },
          ],
          settings: {
            'wamr-ui-theme': 'dark',
          },
        },
      };
      mockRequest.body = importDataPayload;

      const mockExistingService = {
        id: 1,
        name: 'Radarr Service',
        serviceType: 'radarr',
        baseUrl: 'http://old-url.com',
        apiKeyEncrypted: 'encrypted-key',
        enabled: false,
        priorityOrder: 2,
        maxResults: 10,
        qualityProfileId: 2,
        rootFolderPath: '/old-movies',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockServiceConfigRepo.findAll.mockResolvedValue([mockExistingService]);
      mockRequestHistoryRepo.findAll.mockResolvedValue([]);

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockServiceConfigRepo.update).toHaveBeenCalledWith(1, {
        baseUrl: 'http://radarr.example.com',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
      });
      expect(mockRequestHistoryRepo.create).toHaveBeenCalledWith({
        phoneNumberHash: 'hash123',
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: 'radarr',
        serviceConfigId: 1,
        status: 'PENDING',
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
      });
      expect(logger.info).toHaveBeenCalledWith(
        { userId: 1, imported: { services: 1, contacts: 1, requests: 1, settings: 1 } },
        'Data imported successfully'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Data imported successfully',
        imported: { services: 1, contacts: 1, requests: 1, settings: 1 },
        notes: {
          services:
            'Services must be reconfigured with API keys. Only settings were updated for existing services.',
          whatsappConnection: 'WhatsApp connection must be re-established manually.',
          contacts: 'Contacts have been restored.',
          settings: 'Application settings have been restored.',
        },
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should return 400 for invalid import data format', async () => {
      mockRequest.body = {};

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid import data format',
      });
    });

    it('should return 400 for unsupported schema version', async () => {
      mockRequest.body = {
        version: '2.0.0',
        data: {},
      };

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unsupported schema version: 2.0.0. Expected: 1.1.0',
      });
    });

    it('should skip existing requests during import', async () => {
      const importDataPayload = {
        version: '1.1.0',
        data: {
          services: [],
          requests: [
            {
              phoneNumberHash: 'hash123',
              mediaType: 'movie',
              title: 'Test Movie',
              year: 2023,
              tmdbId: 123,
              tvdbId: null,
              serviceType: 'radarr',
              serviceConfigId: 1,
              status: 'PENDING',
              submittedAt: null,
              errorMessage: null,
              adminNotes: null,
            },
          ],
        },
      };
      mockRequest.body = importDataPayload;

      const mockExistingRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: 'radarr',
        serviceConfigId: 1,
        status: 'PENDING',
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockServiceConfigRepo.findAll.mockResolvedValue([]);
      mockRequestHistoryRepo.findAll.mockResolvedValue([mockExistingRequest]);

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockRequestHistoryRepo.create).not.toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Data imported successfully',
        imported: { services: 0, contacts: 0, requests: 0, settings: 0 },
        notes: {
          services:
            'Services must be reconfigured with API keys. Only settings were updated for existing services.',
          whatsappConnection: 'WhatsApp connection must be re-established manually.',
          contacts: 'Contacts have been restored.',
          settings: 'Application settings have been restored.',
        },
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.body = {
        version: '1.1.0',
        data: {
          services: [
            {
              name: 'Test Service',
              serviceType: 'radarr',
              baseUrl: 'http://test.com',
              enabled: true,
              priorityOrder: 1,
              maxResults: 5,
              qualityProfileId: 1,
              rootFolderPath: '/test',
            },
          ],
          requests: [],
        },
      };

      mockServiceConfigRepo.findAll.mockRejectedValue(error);

      await importData(mockRequest as any, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Error importing data');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getSettings', () => {
    it('should return all settings successfully', async () => {
      const mockSettings = [
        {
          id: 1,
          key: 'wamr-ui-theme',
          value: 'dark',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
        {
          id: 2,
          key: 'wamr-notifications',
          value: true,
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
      ];

      mockSettingRepo.findAll.mockResolvedValue(mockSettings);

      await getSettings(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockSettingRepo.findAll).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          'wamr-ui-theme': 'dark',
          'wamr-notifications': true,
        },
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await getSettings(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockSettingRepo.findAll.mockRejectedValue(error);

      await getSettings(mockRequest as any, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Error getting settings');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateSetting', () => {
    it('should update setting successfully', async () => {
      const mockSetting = {
        id: 1,
        key: 'wamr-ui-theme',
        value: 'light',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-01'),
      };

      mockRequest.params = { key: 'wamr-ui-theme' };
      mockRequest.body = { value: 'light' };

      mockSettingRepo.upsert.mockResolvedValue(mockSetting);

      await updateSetting(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockSettingRepo.upsert).toHaveBeenCalledWith({
        key: 'wamr-ui-theme',
        value: 'light',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockSetting,
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { key: 'wamr-ui-theme' };
      mockRequest.body = { value: 'light' };

      await updateSetting(mockRequest as any, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      mockRequest.params = { key: 'wamr-ui-theme' };
      mockRequest.body = { value: 'light' };

      mockSettingRepo.upsert.mockRejectedValue(error);

      await updateSetting(mockRequest as any, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Error updating setting');
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
