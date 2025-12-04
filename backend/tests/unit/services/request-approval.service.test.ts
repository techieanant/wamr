import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestApprovalService } from '../../../src/services/conversation/request-approval.service.js';
import { requestHistoryRepository } from '../../../src/repositories/request-history.repository.js';
import { whatsappConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository.js';
import { mediaServiceConfigRepository } from '../../../src/repositories/media-service-config.repository.js';
import { encryptionService } from '../../../src/services/encryption/encryption.service.js';
import { whatsappClientService } from '../../../src/services/whatsapp/whatsapp-client.service.js';
import {
  webSocketService,
  SocketEvents,
} from '../../../src/services/websocket/websocket.service.js';
import { OverseerrClient } from '../../../src/services/integrations/overseerr.client.js';
import { RadarrClient } from '../../../src/services/integrations/radarr.client.js';
import { SonarrClient } from '../../../src/services/integrations/sonarr.client.js';

// Mock all dependencies
vi.mock('../../../src/repositories/request-history.repository.js');
vi.mock('../../../src/repositories/whatsapp-connection.repository.js');
vi.mock('../../../src/repositories/media-service-config.repository.js');
vi.mock('../../../src/services/encryption/encryption.service.js');
vi.mock('../../../src/services/whatsapp/whatsapp-client.service.js');
vi.mock('../../../src/services/websocket/websocket.service.js');
vi.mock('../../../src/services/integrations/overseerr.client.js');
vi.mock('../../../src/services/integrations/radarr.client.js');
vi.mock('../../../src/services/integrations/sonarr.client.js');

describe('RequestApprovalService', () => {
  let service: RequestApprovalService;

  const mockSelectedResult = {
    title: 'Test Movie',
    year: 2023,
    tmdbId: 12345,
    tvdbId: 67890,
    mediaType: 'movie' as const,
    overview: 'Test overview',
    posterPath: '/test.jpg',
    imdbId: 'tt1234567',
  };

  const mockServiceConfig = {
    id: 1,
    name: 'Test Radarr',
    serviceType: 'radarr' as const,
    baseUrl: 'http://localhost:7878',
    apiKeyEncrypted: 'encrypted-key',
    enabled: true,
    priorityOrder: 1,
    maxResults: 10,
    qualityProfileId: 1,
    rootFolderPath: '/movies',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockConnection = {
    id: 1,
    phoneNumberHash: 'admin-hash',
    status: 'CONNECTED' as const,
    lastConnectedAt: new Date(),
    qrCodeGeneratedAt: null,
    filterType: null,
    filterValue: null,
    autoApprovalMode: 'auto_approve' as const,
    exceptionsEnabled: false,
    exceptionContacts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RequestApprovalService();
  });

  describe('createAndProcessRequest', () => {
    const phoneNumberHash = 'hash123';
    const phoneNumber = '+1234567890';

    describe('auto_deny mode', () => {
      beforeEach(() => {
        vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
          ...mockConnection,
          autoApprovalMode: 'auto_deny',
        });
        vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        vi.mocked(requestHistoryRepository.create).mockResolvedValue({
          id: 1,
          phoneNumberHash,
          status: 'REJECTED',
        } as any);
      });

      it('should create rejected request and send rejection message', async () => {
        vi.mocked(encryptionService.encrypt).mockReturnValue('encrypted-phone');

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result).toEqual({
          success: false,
          errorMessage: 'Request auto-rejected',
          status: 'REJECTED',
        });

        expect(requestHistoryRepository.create).toHaveBeenCalledWith({
          phoneNumberHash,
          phoneNumberEncrypted: 'encrypted-phone',
          mediaType: 'movie',
          title: 'Test Movie',
          year: 2023,
          tmdbId: 12345,
          tvdbId: 67890,
          serviceType: 'radarr',
          serviceConfigId: 1,
          status: 'REJECTED',
          adminNotes: 'Auto-rejected by system settings',
        });

        expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
          phoneNumber,
          '❌ Your request was automatically declined.\n\n🎬 *Test Movie (2023)*\n\nReason: Automatic approval is currently disabled.'
        );

        expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_NEW, {
          requestId: 1,
          title: 'Test Movie',
          user: '7890',
          status: 'REJECTED',
        });
      });

      it('should handle series media type', async () => {
        const seriesResult = { ...mockSelectedResult, mediaType: 'series' as const };

        await service.createAndProcessRequest(phoneNumberHash, phoneNumber, seriesResult, 1);

        expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
          phoneNumber,
          expect.stringContaining('📺')
        );
      });

      it('should handle missing phone number', async () => {
        await service.createAndProcessRequest(phoneNumberHash, undefined, mockSelectedResult, 1);

        expect(whatsappClientService.sendMessage).not.toHaveBeenCalled();
        expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_NEW, {
          requestId: 1,
          title: 'Test Movie',
          user: 'Unknown',
          status: 'REJECTED',
        });
      });
    });

    describe('manual mode', () => {
      beforeEach(() => {
        vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
          ...mockConnection,
          autoApprovalMode: 'manual',
        });
        vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        vi.mocked(requestHistoryRepository.create).mockResolvedValue({
          id: 1,
          phoneNumberHash,
          status: 'PENDING',
        } as any);
      });

      it('should create pending request and send pending message', async () => {
        vi.mocked(encryptionService.encrypt).mockReturnValue('encrypted-phone');

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result).toEqual({
          success: true,
          status: 'PENDING',
        });

        expect(requestHistoryRepository.create).toHaveBeenCalledWith({
          phoneNumberHash,
          phoneNumberEncrypted: 'encrypted-phone',
          mediaType: 'movie',
          title: 'Test Movie',
          year: 2023,
          tmdbId: 12345,
          tvdbId: 67890,
          serviceType: 'radarr',
          serviceConfigId: 1,
          status: 'PENDING',
        });

        expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
          phoneNumber,
          '⏳ Your request is pending approval.\n\n🎬 *Test Movie (2023)*\n\nYou will be notified once an administrator reviews your request.'
        );

        expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_NEW, {
          requestId: 1,
          title: 'Test Movie',
          user: '7890',
          status: 'PENDING',
        });
      });
    });

    describe('auto_approve mode', () => {
      beforeEach(() => {
        vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue(mockConnection);
        vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');
      });

      describe('successful submission', () => {
        beforeEach(() => {
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            phoneNumberHash,
            status: 'SUBMITTED',
          } as any);
        });

        it('should submit to radarr for movie and create submitted request', async () => {
          const mockRadarrClient = {
            addMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          vi.mocked(encryptionService.encrypt).mockReturnValue('encrypted-phone');

          const result = await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'SUBMITTED',
          });

          expect(RadarrClient).toHaveBeenCalledWith('http://localhost:7878', 'decrypted-key');
          expect(mockRadarrClient.addMovie).toHaveBeenCalledWith({
            tmdbId: 12345,
            title: 'Test Movie',
            year: 2023,
            titleSlug: 'test-movie-12345',
            qualityProfileId: 1,
            rootFolderPath: '/movies',
            monitored: true,
            searchForMovie: true,
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'SUBMITTED',
            submittedAt: expect.any(String),
          });

          expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
            phoneNumber,
            "✅ Request submitted successfully!\n\n🎬 *Test Movie (2023)* has been added to the queue.\n\nYou will be notified when it's available."
          );

          expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_NEW, {
            requestId: 1,
            title: 'Test Movie',
            user: '7890',
            status: 'SUBMITTED',
          });
        });

        it('should submit to sonarr for series', async () => {
          const seriesResult = { ...mockSelectedResult, mediaType: 'series' as const };
          const sonarrConfig = { ...mockServiceConfig, serviceType: 'sonarr' as const };

          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(sonarrConfig);

          const mockSonarrClient = {
            addSeries: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(SonarrClient).mockImplementation(() => mockSonarrClient as any);

          await service.createAndProcessRequest(phoneNumberHash, phoneNumber, seriesResult, 1);

          expect(SonarrClient).toHaveBeenCalledWith('http://localhost:7878', 'decrypted-key');
          expect(mockSonarrClient.addSeries).toHaveBeenCalledWith({
            tvdbId: 67890,
            title: 'Test Movie',
            year: 2023,
            titleSlug: 'test-movie-67890',
            qualityProfileId: 1,
            rootFolderPath: '/movies',
            monitored: true,
            searchForMissingEpisodes: true,
          });
        });

        it('should submit to overseerr for movie', async () => {
          const overseerrConfig = { ...mockServiceConfig, serviceType: 'overseerr' as const };

          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(overseerrConfig);

          const mockOverseerrClient = {
            getRadarrServers: vi.fn().mockResolvedValue([{ id: 1, isDefault: true }]),
            requestMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(OverseerrClient).mockImplementation(() => mockOverseerrClient as any);

          await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(OverseerrClient).toHaveBeenCalledWith('http://localhost:7878', 'decrypted-key');
          expect(mockOverseerrClient.getRadarrServers).toHaveBeenCalled();
          expect(mockOverseerrClient.requestMovie).toHaveBeenCalledWith({
            mediaId: 12345,
            serverId: 1,
            profileId: 1,
            rootFolder: '/movies',
          });
        });

        it('should submit to overseerr for series', async () => {
          const seriesResult = { ...mockSelectedResult, mediaType: 'series' as const };
          const overseerrConfig = { ...mockServiceConfig, serviceType: 'overseerr' as const };

          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(overseerrConfig);

          const mockOverseerrClient = {
            getSonarrServers: vi.fn().mockResolvedValue([{ id: 1, isDefault: true }]),
            requestSeries: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(OverseerrClient).mockImplementation(() => mockOverseerrClient as any);

          await service.createAndProcessRequest(phoneNumberHash, phoneNumber, seriesResult, 1);

          expect(mockOverseerrClient.getSonarrServers).toHaveBeenCalled();
          expect(mockOverseerrClient.requestSeries).toHaveBeenCalledWith({
            mediaId: 12345,
            serverId: 1,
            profileId: 1,
            rootFolder: '/movies',
            seasons: 'all', // Added: default to 'all' when no selectedSeasons
          });
        });
      });

      describe('submission failure', () => {
        beforeEach(() => {
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            phoneNumberHash,
            status: 'FAILED',
          } as any);
        });

        it('should handle radarr submission failure', async () => {
          const mockRadarrClient = {
            addMovie: vi.fn().mockRejectedValue(new Error('Radarr API error')),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          vi.mocked(encryptionService.encrypt).mockReturnValue('encrypted-phone');

          const result = await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: false,
            errorMessage: 'Radarr API error',
            status: 'FAILED',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'FAILED',
            errorMessage: 'Radarr API error',
            submittedAt: expect.any(String),
          });

          expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
            phoneNumber,
            '❌ Failed to submit your request.\n\n🎬 *Test Movie (2023)*\n\nRadarr API error'
          );

          expect(webSocketService.emit).toHaveBeenCalledWith(SocketEvents.REQUEST_NEW, {
            requestId: 1,
            title: 'Test Movie',
            user: '7890',
            status: 'FAILED',
          });
        });

        it('should handle missing TMDB ID for movie', async () => {
          const resultWithoutTmdbId = { ...mockSelectedResult, tmdbId: null };

          const result = await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            resultWithoutTmdbId,
            1
          );

          expect(result).toEqual({
            success: false,
            errorMessage: 'Missing TMDB ID for movie request',
            status: 'FAILED',
          });
        });

        it('should handle missing TVDB ID for series', async () => {
          const seriesResult = {
            ...mockSelectedResult,
            mediaType: 'series' as const,
            tvdbId: null,
          };
          const sonarrConfig = { ...mockServiceConfig, serviceType: 'sonarr' as const };

          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(sonarrConfig);

          const result = await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            seriesResult,
            1
          );

          expect(result).toEqual({
            success: false,
            errorMessage: 'Missing TVDB ID for series request',
            status: 'FAILED',
          });
        });

        it('should handle overseerr with no default server', async () => {
          const overseerrConfig = { ...mockServiceConfig, serviceType: 'overseerr' as const };

          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(overseerrConfig);

          const mockOverseerrClient = {
            getRadarrServers: vi.fn().mockResolvedValue([]),
          };
          vi.mocked(OverseerrClient).mockImplementation(() => mockOverseerrClient as any);

          const result = await service.createAndProcessRequest(
            phoneNumberHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: false,
            errorMessage: 'No Radarr server configured in Overseerr',
            status: 'FAILED',
          });
        });
      });
    });

    describe('error handling', () => {
      it('should handle service configuration not found', async () => {
        vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue(mockConnection);
        vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(undefined);

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result).toEqual({
          success: false,
          errorMessage: 'Service configuration not found',
          status: 'FAILED',
        });
      });

      it('should handle unexpected errors', async () => {
        vi.mocked(whatsappConnectionRepository.getActive).mockRejectedValue(new Error('DB error'));

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result).toEqual({
          success: false,
          errorMessage: 'DB error',
          status: 'FAILED',
        });
      });

      it('should handle unknown errors', async () => {
        vi.mocked(whatsappConnectionRepository.getActive).mockRejectedValue('string error');

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result).toEqual({
          success: false,
          errorMessage: 'Unknown error',
          status: 'FAILED',
        });
      });
    });

    describe('default approval mode', () => {
      it('should default to auto_approve when no connection found', async () => {
        vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue(undefined);
        vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');

        const mockRadarrClient = {
          addMovie: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

        vi.mocked(requestHistoryRepository.create).mockResolvedValue({
          id: 1,
          status: 'SUBMITTED',
        } as any);

        const result = await service.createAndProcessRequest(
          phoneNumberHash,
          phoneNumber,
          mockSelectedResult,
          1
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe('SUBMITTED');
      });
    });

    describe('exceptions', () => {
      const exceptionPhoneHash = 'exception-hash';
      const normalPhoneHash = 'normal-hash';

      describe('auto_approve mode with exceptions enabled', () => {
        beforeEach(() => {
          vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
            ...mockConnection,
            autoApprovalMode: 'auto_approve',
            exceptionsEnabled: true,
            exceptionContacts: [exceptionPhoneHash],
          });
          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        });

        it('should treat exception contacts as manual approval', async () => {
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'PENDING',
          } as any);

          const result = await service.createAndProcessRequest(
            exceptionPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'PENDING',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: exceptionPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'PENDING',
          });

          expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
            phoneNumber,
            expect.stringContaining('⏳ Your request is pending approval')
          );
        });

        it('should treat normal contacts as auto-approve', async () => {
          vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'SUBMITTED',
          } as any);

          const mockRadarrClient = {
            addMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          const result = await service.createAndProcessRequest(
            normalPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'SUBMITTED',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: normalPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'SUBMITTED',
            submittedAt: expect.any(String),
          });
        });
      });

      describe('manual mode with exceptions enabled', () => {
        beforeEach(() => {
          vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
            ...mockConnection,
            autoApprovalMode: 'manual',
            exceptionsEnabled: true,
            exceptionContacts: [exceptionPhoneHash],
          });
          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        });

        it('should treat exception contacts as auto-approve', async () => {
          vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'SUBMITTED',
          } as any);

          const mockRadarrClient = {
            addMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          const result = await service.createAndProcessRequest(
            exceptionPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'SUBMITTED',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: exceptionPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'SUBMITTED',
            submittedAt: expect.any(String),
          });
        });

        it('should treat normal contacts as manual approval', async () => {
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'PENDING',
          } as any);

          const result = await service.createAndProcessRequest(
            normalPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'PENDING',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: normalPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'PENDING',
          });
        });
      });

      describe('auto_deny mode with exceptions enabled', () => {
        beforeEach(() => {
          vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
            ...mockConnection,
            autoApprovalMode: 'auto_deny',
            exceptionsEnabled: true,
            exceptionContacts: [exceptionPhoneHash],
          });
          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
        });

        it('should treat exception contacts as auto-approve', async () => {
          vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'SUBMITTED',
          } as any);

          const mockRadarrClient = {
            addMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          const result = await service.createAndProcessRequest(
            exceptionPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'SUBMITTED',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: exceptionPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'SUBMITTED',
            submittedAt: expect.any(String),
          });
        });

        it('should treat normal contacts as auto-deny', async () => {
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'REJECTED',
          } as any);

          const result = await service.createAndProcessRequest(
            normalPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: false,
            errorMessage: 'Request auto-rejected',
            status: 'REJECTED',
          });

          expect(requestHistoryRepository.create).toHaveBeenCalledWith({
            phoneNumberHash: normalPhoneHash,
            phoneNumberEncrypted: 'encrypted-phone',
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 12345,
            tvdbId: 67890,
            serviceType: 'radarr',
            serviceConfigId: 1,
            status: 'REJECTED',
            adminNotes: 'Auto-rejected by system settings',
          });
        });
      });

      describe('exceptions disabled', () => {
        it('should ignore exception contacts when exceptions are disabled', async () => {
          vi.mocked(whatsappConnectionRepository.getActive).mockResolvedValue({
            ...mockConnection,
            autoApprovalMode: 'auto_approve',
            exceptionsEnabled: false,
            exceptionContacts: [exceptionPhoneHash],
          });
          vi.mocked(mediaServiceConfigRepository.findById).mockResolvedValue(mockServiceConfig);
          vi.mocked(encryptionService.decrypt).mockReturnValue('decrypted-key');
          vi.mocked(requestHistoryRepository.create).mockResolvedValue({
            id: 1,
            status: 'SUBMITTED',
          } as any);

          const mockRadarrClient = {
            addMovie: vi.fn().mockResolvedValue(undefined),
          };
          vi.mocked(RadarrClient).mockImplementation(() => mockRadarrClient as any);

          const result = await service.createAndProcessRequest(
            exceptionPhoneHash,
            phoneNumber,
            mockSelectedResult,
            1
          );

          expect(result).toEqual({
            success: true,
            status: 'SUBMITTED',
          });
        });
      });
    });
  });
});
