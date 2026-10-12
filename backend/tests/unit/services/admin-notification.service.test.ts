import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/repositories/setting.repository.js', () => ({
  settingRepository: {
    findByKey: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/whatsapp-connection.repository.js', () => ({
  whatsappConnectionRepository: {
    getActive: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/request-history.repository.js', () => ({
  requestHistoryRepository: {
    findById: vi.fn(),
    findAll: vi.fn(),
    findByStatus: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    findLatestPending: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/conversation-session.repository.js', () => ({
  conversationSessionRepository: {
    findByPhoneHash: vi.fn(),
  },
}));

vi.mock('../../../src/services/whatsapp/whatsapp-client.service.js', () => ({
  whatsappClientService: {
    sendMessage: vi.fn(),
    isReady: vi.fn(),
  },
}));

vi.mock('../../../src/services/encryption/encryption.service.js', () => ({
  encryptionService: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
}));

vi.mock('../../../src/services/encryption/hashing.service.js', () => ({
  hashingService: {
    hashPhoneNumber: vi.fn().mockReturnValue('hashed-phone-number'),
  },
}));

vi.mock('../../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  adminNotificationService,
  ADMIN_NOTIFICATION_PHONE_KEY,
  ADMIN_NOTIFICATION_ENABLED_KEY,
} from '../../../src/services/notifications/admin-notification.service.js';
import { settingRepository } from '../../../src/repositories/setting.repository.js';
import { requestHistoryRepository } from '../../../src/repositories/request-history.repository.js';
import type { RequestHistory } from '../../../src/db/schema.js';
import { whatsappConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository.js';
import { conversationSessionRepository } from '../../../src/repositories/conversation-session.repository.js';
import { whatsappClientService } from '../../../src/services/whatsapp/whatsapp-client.service.js';
import { encryptionService } from '../../../src/services/encryption/encryption.service.js';

describe('AdminNotificationService', () => {
  const mockConnection = {
    id: 1,
    phoneNumberHash: 'admin-hash',
    status: 'CONNECTED' as const,
    lastConnectedAt: new Date(),
    qrCodeGeneratedAt: null,
    filterType: null,
    filterValue: null,
    autoApprovalMode: 'manual_approval' as const,
    exceptionsEnabled: false,
    exceptionContacts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return phone config when settings exist', async () => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });

      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');

      const result = await adminNotificationService.getConfig();

      expect(result).toEqual({
        phoneNumber: '1234567890',
        countryCode: '+1',
        enabled: true,
      });
    });

    it('should return null values when no settings exist', async () => {
      (settingRepository.findByKey as any).mockResolvedValue(null);

      const result = await adminNotificationService.getConfig();

      expect(result).toEqual({
        phoneNumber: null,
        countryCode: null,
        enabled: false,
      });
    });
  });

  describe('setPhone', () => {
    it('should save encrypted phone number', async () => {
      (encryptionService.encrypt as any).mockReturnValue('encrypted-value');
      (settingRepository.upsert as any).mockResolvedValue({ id: 1 });

      const result = await adminNotificationService.setPhone('1234567890', '+1');

      expect(encryptionService.encrypt).toHaveBeenCalledWith('+1:1234567890');
      expect(settingRepository.upsert).toHaveBeenCalled();
      expect(result).toEqual({
        phoneNumber: '1234567890',
        countryCode: '+1',
        fullNumber: '+11234567890',
        encrypted: 'encrypted-value',
      });
    });
  });

  describe('setEnabled', () => {
    it('should save enabled status', async () => {
      (settingRepository.upsert as any).mockResolvedValue({ id: 1 });

      await adminNotificationService.setEnabled(true);

      expect(settingRepository.upsert).toHaveBeenCalledWith({
        key: ADMIN_NOTIFICATION_ENABLED_KEY,
        value: true,
      });
    });

    it('should save disabled status', async () => {
      (settingRepository.upsert as any).mockResolvedValue({ id: 1 });

      await adminNotificationService.setEnabled(false);

      expect(settingRepository.upsert).toHaveBeenCalledWith({
        key: ADMIN_NOTIFICATION_ENABLED_KEY,
        value: false,
      });
    });
  });

  describe('isConfigured', () => {
    it('should return true when WhatsApp is connected, phone is set and enabled', async () => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });
      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');

      const result = await adminNotificationService.isConfigured();

      expect(result).toBe(true);
    });

    it('should return false when WhatsApp is not connected', async () => {
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(null);

      const result = await adminNotificationService.isConfigured();

      expect(result).toBe(false);
    });

    it('should return false when phone is not set', async () => {
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockResolvedValue(null);

      const result = await adminNotificationService.isConfigured();

      expect(result).toBe(false);
    });
  });

  describe('sendTestNotification', () => {
    it('should send test notification successfully', async () => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });
      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');
      (whatsappClientService.isReady as any).mockReturnValue(true);
      (whatsappClientService.sendMessage as any).mockResolvedValue(true);

      const result = await adminNotificationService.sendTestNotification();

      expect(result.success).toBe(true);
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        '+11234567890',
        expect.stringContaining('WAMR Admin Notification Test')
      );
    });

    it('should return error when not configured', async () => {
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(null);

      const result = await adminNotificationService.sendTestNotification();

      expect(result.success).toBe(false);
      expect(whatsappClientService.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error on send failure', async () => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });
      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');
      (whatsappClientService.isReady as any).mockReturnValue(true);
      (whatsappClientService.sendMessage as any).mockRejectedValue(new Error('Send failed'));

      const result = await adminNotificationService.sendTestNotification();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Send failed');
    });
  });

  describe('notifyNewRequest', () => {
    const mockRequest = {
      id: 1,
      phoneNumberHash: 'user-hash',
      phoneNumberEncrypted: 'encrypted-phone',
      mediaType: 'movie' as const,
      title: 'Test Movie',
      tmdbId: 12345,
      status: 'PENDING' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should send notification for new movie request', async () => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });
      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');
      (whatsappClientService.isReady as any).mockReturnValue(true);
      (whatsappClientService.sendMessage as any).mockResolvedValue(true);

      const result = await adminNotificationService.notifyNewRequest(mockRequest as any);

      expect(result).toBe(true);
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        '+11234567890',
        expect.stringContaining('Test Movie')
      );
    });

    it('should not send when notifications not configured', async () => {
      (whatsappConnectionRepository.getActive as any).mockResolvedValue(null);
      (settingRepository.findByKey as any).mockResolvedValue(null);

      const result = await adminNotificationService.notifyNewRequest(mockRequest as any);

      expect(result).toBe(false);
      expect(whatsappClientService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('processAdminReply', () => {
    const mockPendingRequest = {
      id: 1,
      phoneNumberHash: 'user-hash',
      phoneNumberEncrypted: 'encrypted-phone',
      mediaType: 'movie' as const,
      mediaTitle: 'Test Movie',
      mediaTmdbId: 12345,
      status: 'PENDING' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      const phoneValue = JSON.stringify({
        encrypted: 'encrypted-value',
        maskedPhone: '+1 ****7890',
      });

      (whatsappConnectionRepository.getActive as any).mockResolvedValue(mockConnection);
      (settingRepository.findByKey as any).mockImplementation((key: string) => {
        if (key === ADMIN_NOTIFICATION_PHONE_KEY) {
          return Promise.resolve({ key, value: phoneValue });
        }
        if (key === ADMIN_NOTIFICATION_ENABLED_KEY) {
          return Promise.resolve({ key, value: true });
        }
        return Promise.resolve(null);
      });
      (encryptionService.decrypt as any).mockReturnValue('+1:1234567890');
      // Default: no active session
      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(null);
    });

    it('should return handled false when sender is not admin', async () => {
      const result = await adminNotificationService.processAdminReply('+9999999999', 'approve 1');

      expect(result.handled).toBe(false);
    });

    it('should return handled false when not configured', async () => {
      (settingRepository.findByKey as any).mockResolvedValue(null);

      const result = await adminNotificationService.processAdminReply('+11234567890', 'approve 1');

      expect(result.handled).toBe(false);
    });

    it('should return handled false when admin has active conversation session', async () => {
      // Mock admin with an active session in AWAITING_SELECTION state
      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue({
        id: 'session-123',
        phoneNumberHash: 'hashed-phone-number',
        state: 'AWAITING_SELECTION',
        searchResults: [{ title: 'Movie 1' }, { title: 'Movie 2' }],
      });

      // Admin sends "2" which could be interpreted as DECLINE command
      const result = await adminNotificationService.processAdminReply('+11234567890', '2');

      // Should NOT be handled as admin command, allowing normal conversation flow
      expect(result.handled).toBe(false);
    });

    it('should process admin command when admin has no active session', async () => {
      // No active session
      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(null);

      // Admin sends "approve" which is an admin command
      const result = await adminNotificationService.processAdminReply('+11234567890', 'approve');

      // Should be handled (even though no pending request, it's recognized as command)
      expect(result.handled).toBe(true);
    });

    describe('target resolution', () => {
      const pendingRequest = (id: number, title: string) => ({
        id,
        phoneNumberHash: 'user-hash',
        phoneNumberEncrypted: 'encrypted-phone',
        contactName: null,
        mediaType: 'movie' as const,
        title,
        year: 2023,
        tmdbId: 12345,
        tvdbId: null,
        status: 'PENDING' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      beforeEach(() => {
        (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(null);
      });

      it('explicit ID wins over everything: approve 7 targets #7 even with other pending', async () => {
        (requestHistoryRepository.findById as any).mockResolvedValue(pendingRequest(7, 'Target'));
        (requestHistoryRepository.update as any).mockResolvedValue({ id: 7 });
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(7, 'Target'),
          pendingRequest(9, 'Other'),
        ]);

        const result = await adminNotificationService.processAdminReply(
          '+11234567890',
          'approve 7'
        );

        expect(result.handled).toBe(true);
        expect(result.response).toContain('#7');
        expect(result.response).not.toContain('#9');
        expect(requestHistoryRepository.findById).toHaveBeenCalledWith(7);
      });

      it('quoted stanzaId resolves to the notification the admin replied to', async () => {
        (requestHistoryRepository.findById as any).mockResolvedValue(pendingRequest(5, 'Quoted'));
        (requestHistoryRepository.update as any).mockResolvedValue({ id: 5 });
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(5, 'Quoted'),
          pendingRequest(9, 'Other'),
        ]);

        // Seed the module-level notification map through the public API:
        // notifyNewRequest stores the stanza id returned by sendMessage.
        (whatsappClientService.sendMessage as any).mockResolvedValue('STANZA-5');
        await adminNotificationService.notifyNewRequest(
          pendingRequest(5, 'Quoted') as unknown as RequestHistory
        );

        const result = await adminNotificationService.processAdminReply(
          '+11234567890',
          'approve',
          'STANZA-5'
        );

        expect(result.handled).toBe(true);
        expect(result.response).toContain('#5');
        expect(requestHistoryRepository.findById).toHaveBeenCalledWith(5);
      });

      it('unknown quoted stanzaId falls through to ambiguous-bare-command refusal', async () => {
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(5, 'A'),
          pendingRequest(9, 'B'),
        ]);

        const result = await adminNotificationService.processAdminReply(
          '+11234567890',
          'approve',
          'UNKNOWN-STANZA'
        );

        expect(result.handled).toBe(true);
        expect(result.response).toContain('2 pending requests');
        expect(result.response).toContain('#5');
        expect(result.response).toContain('#9');
        // Must NOT have acted on any request
        expect(requestHistoryRepository.findById).not.toHaveBeenCalled();
      });

      it('bare command with exactly one pending acts on it', async () => {
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(3, 'Only'),
        ]);
        (requestHistoryRepository.findById as any).mockResolvedValue(pendingRequest(3, 'Only'));
        (requestHistoryRepository.update as any).mockResolvedValue({ id: 3 });

        const result = await adminNotificationService.processAdminReply('+11234567890', 'approve');

        expect(result.handled).toBe(true);
        expect(result.response).toContain('#3');
        expect(requestHistoryRepository.findById).toHaveBeenCalledWith(3);
      });

      it('bare command with multiple pending refuses and sends digest instead of guessing', async () => {
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(5, 'A'),
          pendingRequest(9, 'B'),
        ]);

        const result = await adminNotificationService.processAdminReply('+11234567890', 'approve');

        expect(result.handled).toBe(true);
        expect(result.response).toContain('specify which one');
        // The old behavior silently approved the newest pending — assert it's gone
        expect(requestHistoryRepository.findById).not.toHaveBeenCalled();
        expect(requestHistoryRepository.update).not.toHaveBeenCalled();
      });

      it('bare command with zero pending reports empty', async () => {
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([]);

        const result = await adminNotificationService.processAdminReply('+11234567890', 'approve');

        expect(result.handled).toBe(true);
        expect(result.response).toContain('No pending requests');
      });

      it('PENDING command returns digest with IDs', async () => {
        (requestHistoryRepository.findByStatus as any).mockResolvedValue([
          pendingRequest(5, 'Movie A'),
          pendingRequest(9, 'Show B'),
        ]);

        const result = await adminNotificationService.processAdminReply('+11234567890', 'pending');

        expect(result.handled).toBe(true);
        expect(result.response).toContain('Pending requests (2)');
        expect(result.response).toContain('#5');
        expect(result.response).toContain('#9');
        expect(result.response).toContain('Movie A');
      });
    });
  });
});
