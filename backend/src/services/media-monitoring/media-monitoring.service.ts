/**
 * Media Monitoring Service
 *
 * Periodically checks Radarr/Sonarr/Overseerr for request completion
 * and notifies users via WhatsApp when their requested media becomes available
 */

import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { OverseerrClient } from '../integrations/overseerr.client.js';
// import { RadarrClient } from '../integrations/radarr.client.js';
// import { SonarrClient } from '../integrations/sonarr.client.js';
import { encryptionService } from '../encryption/encryption.service.js';

/**
 * Media Monitoring Service
 * Checks for completed media requests and notifies users
 */
class MediaMonitoringService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = env.MEDIA_MONITORING_INTERVAL_MS;
  private isMonitoring = false;

  /**
   * Start monitoring for completed requests
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Media monitoring already running');
      return;
    }

    this.isMonitoring = true;
    logger.info(
      { intervalMinutes: this.CHECK_INTERVAL_MS / 60000 },
      'Starting media monitoring service'
    );

    // Run initial check immediately
    this.checkCompletedRequests().catch((error) => {
      logger.error({ error }, 'Error in initial media monitoring check');
    });

    // Set up periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkCompletedRequests().catch((error) => {
        logger.error({ error }, 'Error in periodic media monitoring check');
      });
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Stopped media monitoring service');
  }

  /**
   * Check all submitted requests for completion
   */
  private async checkCompletedRequests(): Promise<void> {
    try {
      logger.info('Checking for completed media requests...');

      // Get all submitted requests that haven't been marked as available
      const pendingRequests = await requestHistoryRepository.findByStatus('SUBMITTED');

      if (pendingRequests.length === 0) {
        logger.debug('No pending requests to check');
        return;
      }

      logger.info({ count: pendingRequests.length }, 'Found pending requests to check');

      for (const request of pendingRequests) {
        try {
          await this.checkRequestStatus(request);
        } catch (error) {
          logger.error(
            { requestId: request.id, title: request.title, error },
            'Error checking individual request'
          );
        }
      }

      logger.info('Completed media request check cycle');
    } catch (error) {
      logger.error({ error }, 'Error checking completed requests');
    }
  }

  /**
   * Check status of a single request
   */
  private async checkRequestStatus(request: any): Promise<void> {
    if (!request.serviceConfigId || !request.serviceType) {
      logger.warn({ requestId: request.id }, 'Request missing service info, skipping');
      return;
    }

    // Get service configuration
    const service = await mediaServiceConfigRepository.findById(request.serviceConfigId);

    if (!service || !service.enabled) {
      logger.warn(
        { requestId: request.id, serviceId: request.serviceConfigId },
        'Service not found or disabled'
      );
      return;
    }

    // Decrypt API key
    const apiKey = encryptionService.decrypt(service.apiKeyEncrypted);

    let isAvailable = false;

    try {
      if (service.serviceType === 'overseerr') {
        isAvailable = await this.checkOverseerrStatus(service.baseUrl, apiKey, request);
      } else if (service.serviceType === 'radarr' && request.mediaType === 'movie') {
        isAvailable = await this.checkRadarrStatus(service.baseUrl, apiKey, request);
      } else if (service.serviceType === 'sonarr' && request.mediaType === 'series') {
        isAvailable = await this.checkSonarrStatus(service.baseUrl, apiKey, request);
      }

      if (isAvailable) {
        logger.info(
          { requestId: request.id, title: request.title },
          'Media is now available! Notifying user...'
        );

        // Update request status
        await requestHistoryRepository.update(request.id, {
          status: 'APPROVED', // Mark as approved/completed
          updatedAt: new Date().toISOString(),
        });

        // Send WhatsApp notification
        await this.notifyUserMediaAvailable(request);
      }
    } catch (error) {
      logger.error(
        { requestId: request.id, serviceType: service.serviceType, error },
        'Error checking service status'
      );
    }
  }

  /**
   * Check Overseerr for media availability
   */
  private async checkOverseerrStatus(
    baseUrl: string,
    apiKey: string,
    request: any
  ): Promise<boolean> {
    const client = new OverseerrClient(baseUrl, apiKey);

    try {
      // Search for the media to get its current status
      const searchResults = await client.search(request.title);

      // Find exact match by TMDB/TVDB ID
      const match = searchResults.results.find((result: any) => {
        if (request.mediaType === 'movie' && request.tmdbId) {
          return result.id === request.tmdbId && result.mediaType === 'movie';
        } else if (request.mediaType === 'series' && request.tmdbId) {
          return result.id === request.tmdbId && result.mediaType === 'tv';
        }
        return false;
      });

      if (!match) {
        logger.debug({ requestId: request.id }, 'Media not found in Overseerr search');
        return false;
      }

      // Check if media is available (status 5 = available)
      const isAvailable = match.mediaInfo?.status === 5;

      logger.debug(
        { requestId: request.id, status: match.mediaInfo?.status, isAvailable },
        'Overseerr media status'
      );

      return isAvailable;
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error checking Overseerr status');
      return false;
    }
  }

  /**
   * Check Radarr for movie availability
   * Note: This requires additional API methods to be implemented in RadarrClient
   */
  private async checkRadarrStatus(
    _baseUrl: string,
    _apiKey: string,
    request: any
  ): Promise<boolean> {
    // TODO: Implement when Radarr client has getMovies() method
    logger.warn(
      { requestId: request.id },
      'Radarr status checking not yet implemented - requires getMovies() API method'
    );
    return false;
  }

  /**
   * Check Sonarr for series availability
   * Note: This requires additional API methods to be implemented in SonarrClient
   */
  private async checkSonarrStatus(
    _baseUrl: string,
    _apiKey: string,
    request: any
  ): Promise<boolean> {
    // TODO: Implement when Sonarr client has getSeries() method
    logger.warn(
      { requestId: request.id },
      'Sonarr status checking not yet implemented - requires getSeries() API method'
    );
    return false;
  }

  /**
   * Notify user via WhatsApp that their media is available
   */
  private async notifyUserMediaAvailable(request: any): Promise<void> {
    try {
      // First, try to get phone number from encrypted field
      let phoneNumber: string | null = null;

      if (request.phoneNumberEncrypted) {
        try {
          phoneNumber = encryptionService.decrypt(request.phoneNumberEncrypted);
          logger.debug(
            { requestId: request.id, hasPhone: !!phoneNumber },
            'Decrypted phone number from request'
          );
        } catch (error) {
          logger.error({ error, requestId: request.id }, 'Failed to decrypt phone number');
        }
      }

      // Fallback: try to get from active phone numbers map (if user has active session)
      if (!phoneNumber) {
        const { conversationService } = await import('../conversation/conversation.service.js');
        const { conversationSessionRepository } = await import(
          '../../repositories/conversation-session.repository.js'
        );
        const session = await conversationSessionRepository.findByPhoneHash(
          request.phoneNumberHash
        );

        if (session) {
          // @ts-ignore - accessing private property for notification
          phoneNumber = conversationService.activePhoneNumbers?.get(session.id);
        }
      }

      if (!phoneNumber) {
        logger.info(
          { requestId: request.id, phoneHash: request.phoneNumberHash.slice(-4) },
          'No phone number available - user will see media next time they interact'
        );
        return;
      }

      // Send notification via WhatsApp
      const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');

      const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
      const yearStr = request.year ? ` (${request.year})` : '';
      const message =
        `🎉 *Good news!*\n\n` +
        `${emoji} *${request.title}${yearStr}* is now available in your library!\n\n` +
        `You can start watching it now.`;

      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.info(
        { requestId: request.id, title: request.title, phoneNumber: phoneNumber.slice(-4) },
        'Sent availability notification to user'
      );
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error sending availability notification');
    }
  }

  /**
   * Manually trigger a check (for testing or admin actions)
   */
  async triggerCheck(): Promise<void> {
    logger.info('Manually triggered media monitoring check');
    await this.checkCompletedRequests();
  }
}

// Export singleton instance
export const mediaMonitoringService = new MediaMonitoringService();
