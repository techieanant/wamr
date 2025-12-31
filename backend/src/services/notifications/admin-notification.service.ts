/**
 * Admin Notification Service
 * Handles sending WhatsApp notifications to admin for new requests
 * and processing admin replies for approve/decline/delete actions
 */

import { logger } from '../../config/logger.js';
import { settingRepository } from '../../repositories/setting.repository.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import { encryptionService } from '../encryption/encryption.service.js';
import { whatsappClientService } from '../whatsapp/whatsapp-client.service.js';
import type { RequestHistory } from '../../db/schema.js';

// Setting keys for admin notification configuration
export const ADMIN_NOTIFICATION_PHONE_KEY = 'admin-notification-phone';
export const ADMIN_NOTIFICATION_ENABLED_KEY = 'admin-notification-enabled';

// Reply patterns for admin actions
const APPROVE_PATTERN = /^(?:approve|yes|a|1)\s*$/i;
const DECLINE_PATTERN = /^(?:decline|deny|reject|no|d|n|2)\s*$/i;
const DELETE_PATTERN = /^(?:delete|del|remove|3)\s*$/i;

// Map to track pending admin notifications (requestId -> timestamp)
const pendingNotifications = new Map<number, { timestamp: Date; messageId?: string }>();

interface AdminNotificationConfig {
  phoneNumber: string | null;
  countryCode: string | null;
  enabled: boolean;
}

interface AdminNotificationPhone {
  phoneNumber: string;
  countryCode: string;
  fullNumber: string;
  encrypted?: string;
}

class AdminNotificationService {
  /**
   * Get admin notification configuration
   */
  async getConfig(): Promise<AdminNotificationConfig> {
    const phoneSetting = await settingRepository.findByKey(ADMIN_NOTIFICATION_PHONE_KEY);
    const enabledSetting = await settingRepository.findByKey(ADMIN_NOTIFICATION_ENABLED_KEY);

    let phoneNumber: string | null = null;
    let countryCode: string | null = null;

    if (phoneSetting?.value) {
      try {
        const phoneData =
          typeof phoneSetting.value === 'string'
            ? JSON.parse(phoneSetting.value)
            : phoneSetting.value;

        if (phoneData.encrypted) {
          const decrypted = encryptionService.decrypt(phoneData.encrypted);
          const parts = decrypted.split(':');
          countryCode = parts[0] || null;
          phoneNumber = parts[1] || null;
        } else {
          countryCode = phoneData.countryCode || null;
          phoneNumber = phoneData.phoneNumber || null;
        }
      } catch (e) {
        logger.error({ error: e }, 'Failed to parse admin notification phone');
      }
    }

    return {
      phoneNumber,
      countryCode,
      enabled: enabledSetting?.value === true,
    };
  }

  /**
   * Set admin notification phone number
   */
  async setPhone(phoneNumber: string, countryCode: string): Promise<AdminNotificationPhone> {
    // Create encrypted value with format "countryCode:phoneNumber"
    const fullNumber = `${countryCode}${phoneNumber}`.replace(/[^+\d]/g, '');
    const plainValue = `${countryCode}:${phoneNumber}`;
    const encrypted = encryptionService.encrypt(plainValue);

    await settingRepository.upsert({
      key: ADMIN_NOTIFICATION_PHONE_KEY,
      value: JSON.stringify({
        encrypted,
        maskedPhone: `${countryCode} ****${phoneNumber.slice(-4)}`,
      }),
    });

    logger.info({ maskedPhone: `****${phoneNumber.slice(-4)}` }, 'Admin notification phone set');

    return {
      phoneNumber,
      countryCode,
      fullNumber,
      encrypted,
    };
  }

  /**
   * Enable or disable admin notifications
   */
  async setEnabled(enabled: boolean): Promise<void> {
    await settingRepository.upsert({
      key: ADMIN_NOTIFICATION_ENABLED_KEY,
      value: enabled,
    });

    logger.info({ enabled }, 'Admin notification enabled status updated');
  }

  /**
   * Check if admin notifications are properly configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();

    // Check if WhatsApp is connected
    const connection = await whatsappConnectionRepository.getActive();
    if (!connection || connection.status !== 'CONNECTED') {
      return false;
    }

    return config.enabled && config.phoneNumber !== null && config.countryCode !== null;
  }

  /**
   * Get full admin phone number for sending messages
   */
  async getAdminPhoneNumber(): Promise<string | null> {
    const config = await this.getConfig();

    if (!config.phoneNumber || !config.countryCode) {
      return null;
    }

    // Build full phone number in E.164 format
    const fullNumber = `${config.countryCode}${config.phoneNumber}`.replace(/[^+\d]/g, '');
    return fullNumber.startsWith('+') ? fullNumber : `+${fullNumber}`;
  }

  /**
   * Send test notification to admin phone
   */
  async sendTestNotification(): Promise<{ success: boolean; message: string }> {
    const isConfigured = await this.isConfigured();

    if (!isConfigured) {
      return {
        success: false,
        message:
          'Admin notifications are not configured. Please set a phone number and enable notifications.',
      };
    }

    const adminPhone = await this.getAdminPhoneNumber();

    if (!adminPhone) {
      return {
        success: false,
        message: 'Admin phone number is not set.',
      };
    }

    if (!whatsappClientService.isReady()) {
      return {
        success: false,
        message: 'WhatsApp is not connected. Please connect WhatsApp first.',
      };
    }

    try {
      const message =
        `🔔 *WAMR Admin Notification Test*\n\n` +
        `This is a test notification from your WAMR system.\n\n` +
        `If you received this message, admin notifications are working correctly!\n\n` +
        `_Sent at: ${new Date().toLocaleString()}_`;

      await whatsappClientService.sendMessage(adminPhone, message);

      logger.info({ adminPhone: adminPhone.slice(-4) }, 'Test notification sent to admin');

      return {
        success: true,
        message: 'Test notification sent successfully.',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to send test notification');

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send test notification.',
      };
    }
  }

  /**
   * Send notification for new request
   */
  async notifyNewRequest(request: RequestHistory): Promise<boolean> {
    const isConfigured = await this.isConfigured();

    if (!isConfigured) {
      logger.debug('Admin notifications not configured, skipping new request notification');
      return false;
    }

    const adminPhone = await this.getAdminPhoneNumber();

    if (!adminPhone) {
      return false;
    }

    if (!whatsappClientService.isReady()) {
      logger.warn('WhatsApp not ready, cannot send admin notification');
      return false;
    }

    try {
      const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
      const yearStr = request.year ? ` (${request.year})` : '';
      const requesterInfo =
        request.contactName || `****${request.phoneNumberHash?.slice(-4) || 'Unknown'}`;
      const seasonsInfo = request.selectedSeasons
        ? `\nSeasons: ${(request.selectedSeasons as number[]).join(', ')}`
        : '';

      const message =
        `🔔 *New Media Request #${request.id}*\n\n` +
        `${emoji} *${request.title}${yearStr}*${seasonsInfo}\n` +
        `📱 Requested by: ${requesterInfo}\n` +
        `⏰ Status: ${request.status}\n\n` +
        `Reply with:\n` +
        `• *APPROVE* or *1* - Approve request\n` +
        `• *DECLINE* or *2* - Decline request\n` +
        `• *DELETE* or *3* - Delete request`;

      await whatsappClientService.sendMessage(adminPhone, message);

      // Track pending notification
      pendingNotifications.set(request.id, { timestamp: new Date() });

      logger.info(
        { requestId: request.id, adminPhone: adminPhone.slice(-4) },
        'Admin notification sent for new request'
      );

      return true;
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Failed to send admin notification');
      return false;
    }
  }

  /**
   * Check if a message is from the admin phone number
   */
  async isFromAdmin(phoneNumber: string): Promise<boolean> {
    const adminPhone = await this.getAdminPhoneNumber();

    if (!adminPhone) {
      return false;
    }

    // Normalize phone numbers for comparison
    const normalizedAdmin = adminPhone.replace(/[^0-9]/g, '');
    const normalizedInput = phoneNumber.replace(/[^0-9]/g, '');

    return normalizedAdmin === normalizedInput;
  }

  /**
   * Process admin reply for request action
   * Returns true if the message was handled as an admin command
   */
  async processAdminReply(
    phoneNumber: string,
    message: string
  ): Promise<{ handled: boolean; response?: string }> {
    const isAdmin = await this.isFromAdmin(phoneNumber);

    if (!isAdmin) {
      return { handled: false };
    }

    const trimmedMessage = message.trim();

    // Check for request ID pattern: "approve 123" or "1 123" or just "approve" (applies to latest)
    const commandMatch = trimmedMessage.match(/^(\w+)\s*(\d+)?$/i);

    if (!commandMatch) {
      return { handled: false };
    }

    const command = commandMatch[1].toLowerCase();
    let requestId = commandMatch[2] ? parseInt(commandMatch[2], 10) : null;

    // Determine action from command
    let action: 'approve' | 'decline' | 'delete' | null = null;

    if (APPROVE_PATTERN.test(command) || command === '1') {
      action = 'approve';
    } else if (DECLINE_PATTERN.test(command) || command === '2') {
      action = 'decline';
    } else if (DELETE_PATTERN.test(command) || command === '3') {
      action = 'delete';
    }

    if (!action) {
      return { handled: false };
    }

    // If no request ID provided, get the latest pending request
    if (!requestId) {
      const latestPending = await requestHistoryRepository.findLatestPending();
      if (latestPending) {
        requestId = latestPending.id;
      }
    }

    if (!requestId) {
      return {
        handled: true,
        response: '❌ No pending request found. Please specify a request ID.',
      };
    }

    // Get the request
    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      return {
        handled: true,
        response: `❌ Request #${requestId} not found.`,
      };
    }

    // Handle the action
    try {
      const result = await this.handleRequestAction(request, action);
      return { handled: true, response: result };
    } catch (error) {
      logger.error({ error, requestId, action }, 'Failed to process admin reply action');
      return {
        handled: true,
        response: `❌ Failed to ${action} request #${requestId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle approve/decline/delete action on a request
   */
  private async handleRequestAction(
    request: RequestHistory,
    action: 'approve' | 'decline' | 'delete'
  ): Promise<string> {
    const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
    const yearStr = request.year ? ` (${request.year})` : '';
    const titleInfo = `${emoji} *${request.title}${yearStr}*`;

    // Import services dynamically to avoid circular dependencies
    const { webSocketService, SocketEvents } = await import('../websocket/websocket.service.js');

    if (action === 'delete') {
      await requestHistoryRepository.delete(request.id);

      // Clear from pending notifications
      pendingNotifications.delete(request.id);

      // Emit WebSocket event
      webSocketService.emit(SocketEvents.REQUEST_DELETED, {
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });

      logger.info({ requestId: request.id }, 'Request deleted via admin WhatsApp reply');

      return `✅ Request #${request.id} deleted.\n\n${titleInfo}`;
    }

    if (action === 'decline') {
      if (request.status !== 'PENDING' && request.status !== 'FAILED') {
        return `❌ Request #${request.id} cannot be declined (status: ${request.status})`;
      }

      await requestHistoryRepository.update(request.id, {
        status: 'REJECTED',
        adminNotes: 'Declined via WhatsApp',
        updatedAt: new Date().toISOString(),
      });

      // Clear from pending notifications
      pendingNotifications.delete(request.id);

      // Send notification to requester if phone available
      if (request.phoneNumberEncrypted) {
        try {
          const requesterPhone = encryptionService.decrypt(request.phoneNumberEncrypted);
          const message = `❌ Your request was declined.\n\n${titleInfo}`;
          await whatsappClientService.sendMessage(requesterPhone, message);
        } catch (e) {
          logger.error({ error: e }, 'Failed to notify requester of decline');
        }
      }

      // Emit WebSocket event
      webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
        requestId: request.id,
        status: 'REJECTED',
        previousStatus: request.status,
        timestamp: new Date().toISOString(),
      });

      logger.info({ requestId: request.id }, 'Request declined via admin WhatsApp reply');

      return `✅ Request #${request.id} declined.\n\n${titleInfo}`;
    }

    if (action === 'approve') {
      if (request.status !== 'PENDING' && request.status !== 'FAILED') {
        return `❌ Request #${request.id} cannot be approved (status: ${request.status})`;
      }

      // Use the existing approval flow
      const { mediaServiceConfigRepository } = await import(
        '../../repositories/media-service-config.repository.js'
      );

      if (!request.serviceConfigId) {
        return `❌ Request #${request.id} has no service configuration`;
      }

      const service = await mediaServiceConfigRepository.findById(request.serviceConfigId);

      if (!service || !service.enabled) {
        return `❌ Service not found or disabled for request #${request.id}`;
      }

      // Submit to service
      const { OverseerrClient } = await import('../integrations/overseerr.client.js');
      const { RadarrClient } = await import('../integrations/radarr.client.js');
      const { SonarrClient } = await import('../integrations/sonarr.client.js');

      const apiKey = encryptionService.decrypt(service.apiKeyEncrypted);

      try {
        if (service.serviceType === 'overseerr') {
          const client = new OverseerrClient(service.baseUrl, apiKey);

          if (request.mediaType === 'movie' && request.tmdbId) {
            const radarrServers = await client.getRadarrServers();
            const defaultServer = radarrServers.find((s) => s.isDefault) || radarrServers[0];

            if (!defaultServer) {
              throw new Error('No Radarr server configured in Overseerr');
            }

            await client.requestMovie({
              mediaId: request.tmdbId,
              serverId: defaultServer.id,
              profileId: 1,
              rootFolder: '/movies',
            });
          } else if (request.mediaType === 'series' && request.tmdbId) {
            const sonarrServers = await client.getSonarrServers();
            const defaultServer = sonarrServers.find((s) => s.isDefault) || sonarrServers[0];

            if (!defaultServer) {
              throw new Error('No Sonarr server configured in Overseerr');
            }

            const selectedSeasons = request.selectedSeasons as number[] | null;

            await client.requestSeries({
              mediaId: request.tmdbId,
              serverId: defaultServer.id,
              profileId: 1,
              rootFolder: '/tv',
              seasons: selectedSeasons && selectedSeasons.length > 0 ? selectedSeasons : 'all',
            });
          }
        } else if (service.serviceType === 'radarr' && request.mediaType === 'movie') {
          const client = new RadarrClient(service.baseUrl, apiKey);

          if (!request.tmdbId) {
            throw new Error('Missing TMDB ID for movie request');
          }

          const titleSlug = `${request.title}-${request.tmdbId}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

          await client.addMovie({
            tmdbId: request.tmdbId,
            title: request.title,
            year: request.year ?? 0,
            titleSlug,
            qualityProfileId: service.qualityProfileId ?? 1,
            rootFolderPath: service.rootFolderPath || '/movies',
            monitored: true,
            searchForMovie: true,
          });
        } else if (service.serviceType === 'sonarr' && request.mediaType === 'series') {
          const client = new SonarrClient(service.baseUrl, apiKey);

          if (!request.tvdbId) {
            throw new Error('Missing TVDB ID for series request');
          }

          const titleSlug = `${request.title}-${request.tvdbId}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

          await client.addSeries({
            tvdbId: request.tvdbId,
            title: request.title,
            year: request.year ?? 0,
            titleSlug,
            qualityProfileId: service.qualityProfileId ?? 1,
            rootFolderPath: service.rootFolderPath || '/tv',
            monitored: true,
            searchForMissingEpisodes: true,
          });
        }

        // Update request status
        await requestHistoryRepository.update(request.id, {
          status: 'SUBMITTED',
          submittedAt: new Date().toISOString(),
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        });

        // Clear from pending notifications
        pendingNotifications.delete(request.id);

        // Send notification to requester
        if (request.phoneNumberEncrypted) {
          try {
            const requesterPhone = encryptionService.decrypt(request.phoneNumberEncrypted);
            const message = `✅ Your request has been approved!\n\n${titleInfo} has been added to the queue.\n\nYou will be notified when it's available.`;
            await whatsappClientService.sendMessage(requesterPhone, message);
          } catch (e) {
            logger.error({ error: e }, 'Failed to notify requester of approval');
          }
        }

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
          requestId: request.id,
          status: 'SUBMITTED',
          previousStatus: request.status,
          timestamp: new Date().toISOString(),
        });

        logger.info({ requestId: request.id }, 'Request approved via admin WhatsApp reply');

        return `✅ Request #${request.id} approved and submitted.\n\n${titleInfo}`;
      } catch (error) {
        // Update to FAILED status
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await requestHistoryRepository.update(request.id, {
          status: 'FAILED',
          errorMessage,
          updatedAt: new Date().toISOString(),
        });

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
          requestId: request.id,
          status: 'FAILED',
          previousStatus: request.status,
          errorMessage,
          timestamp: new Date().toISOString(),
        });

        throw error;
      }
    }

    return '❌ Unknown action';
  }

  /**
   * Clear old pending notifications (older than 24 hours)
   */
  cleanupOldNotifications(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const [requestId, data] of pendingNotifications.entries()) {
      if (data.timestamp < oneDayAgo) {
        pendingNotifications.delete(requestId);
      }
    }
  }
}

// Export singleton instance
export const adminNotificationService = new AdminNotificationService();
