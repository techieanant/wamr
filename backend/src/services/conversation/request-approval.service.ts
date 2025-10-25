/**
 * Request Approval Service
 * Handles automatic approval/denial logic and request submission
 */
import { logger } from '../../config/logger.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { encryptionService } from '../encryption/encryption.service.js';
import { whatsappClientService } from '../whatsapp/whatsapp-client.service.js';
import { webSocketService, SocketEvents } from '../websocket/websocket.service.js';
import { OverseerrClient } from '../integrations/overseerr.client.js';
import { RadarrClient } from '../integrations/radarr.client.js';
import { SonarrClient } from '../integrations/sonarr.client.js';
import type { NormalizedResult } from '../../models/conversation-session.model.js';
import type { MediaType, ServiceType } from '../../models/request-history.model.js';

export class RequestApprovalService {
  /**
   * Create request and handle based on auto-approval mode
   */
  async createAndProcessRequest(
    phoneNumberHash: string,
    phoneNumber: string | undefined,
    selectedResult: NormalizedResult,
    serviceConfigId: number
  ): Promise<{ success: boolean; errorMessage?: string; status: string }> {
    try {
      // Get auto-approval mode from the active WhatsApp connection (admin's connection)
      // Note: We use getActive() because approval mode is a system-wide setting,
      // not per-user. The phoneNumberHash is for the requester, not the admin.
      const connection = await whatsappConnectionRepository.getActive();
      const autoApprovalMode = connection?.autoApprovalMode || 'auto_approve';

      logger.info(
        { phoneNumberHash, autoApprovalMode, connectionId: connection?.id },
        'Processing request with approval mode'
      );

      const phoneNumberEncrypted = phoneNumber ? encryptionService.encrypt(phoneNumber) : undefined;

      const mediaType: MediaType = selectedResult.mediaType === 'movie' ? 'movie' : 'series';

      // Get service type
      const service = await mediaServiceConfigRepository.findById(serviceConfigId);
      if (!service) {
        throw new Error('Service configuration not found');
      }

      const serviceType: ServiceType = service.serviceType;

      // Handle based on approval mode
      if (autoApprovalMode === 'auto_deny') {
        // Auto-deny: Create REJECTED request and notify user
        const request = await requestHistoryRepository.create({
          phoneNumberHash,
          phoneNumberEncrypted,
          mediaType,
          title: selectedResult.title,
          year: selectedResult.year ?? undefined,
          tmdbId: selectedResult.tmdbId ?? undefined,
          tvdbId: selectedResult.tvdbId ?? undefined,
          serviceType,
          serviceConfigId,
          status: 'REJECTED',
          adminNotes: 'Auto-rejected by system settings',
        });

        // Send rejection message
        if (phoneNumber) {
          const emoji = mediaType === 'movie' ? '🎬' : '📺';
          const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
          const message = `❌ Your request was automatically declined.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\nReason: Automatic approval is currently disabled.`;
          await whatsappClientService.sendMessage(phoneNumber, message);
        }

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_NEW, {
          requestId: request.id,
          title: selectedResult.title,
          user: phoneNumber?.slice(-4) || 'Unknown',
          status: 'REJECTED',
        });

        return { success: false, errorMessage: 'Request auto-rejected', status: 'REJECTED' };
      } else if (autoApprovalMode === 'manual') {
        // Manual mode: Create PENDING request
        const request = await requestHistoryRepository.create({
          phoneNumberHash,
          phoneNumberEncrypted,
          mediaType,
          title: selectedResult.title,
          year: selectedResult.year ?? undefined,
          tmdbId: selectedResult.tmdbId ?? undefined,
          tvdbId: selectedResult.tvdbId ?? undefined,
          serviceType,
          serviceConfigId,
          status: 'PENDING',
        });

        // Send pending message
        if (phoneNumber) {
          const emoji = mediaType === 'movie' ? '🎬' : '📺';
          const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
          const message = `⏳ Your request is pending approval.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\nYou will be notified once an administrator reviews your request.`;
          await whatsappClientService.sendMessage(phoneNumber, message);
        }

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_NEW, {
          requestId: request.id,
          title: selectedResult.title,
          user: phoneNumber?.slice(-4) || 'Unknown',
          status: 'PENDING',
        });

        return { success: true, status: 'PENDING' };
      } else {
        // Auto-approve: Submit directly
        const result = await this.submitToService(
          selectedResult,
          service.serviceType,
          service.baseUrl,
          encryptionService.decrypt(service.apiKeyEncrypted),
          service.qualityProfileId ?? 1,
          service.rootFolderPath || (mediaType === 'movie' ? '/movies' : '/tv')
        );

        if (result.success) {
          // Create SUBMITTED request
          const request = await requestHistoryRepository.create({
            phoneNumberHash,
            phoneNumberEncrypted,
            mediaType,
            title: selectedResult.title,
            year: selectedResult.year ?? undefined,
            tmdbId: selectedResult.tmdbId ?? undefined,
            tvdbId: selectedResult.tvdbId ?? undefined,
            serviceType,
            serviceConfigId,
            status: 'SUBMITTED',
            submittedAt: new Date().toISOString(),
          });

          // Send success message
          if (phoneNumber) {
            const emoji = mediaType === 'movie' ? '🎬' : '📺';
            const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
            const message = `✅ Request submitted successfully!\n\n${emoji} *${selectedResult.title}${yearStr}* has been added to the queue.\n\nYou will be notified when it's available.`;
            await whatsappClientService.sendMessage(phoneNumber, message);
          }

          // Emit WebSocket event
          webSocketService.emit(SocketEvents.REQUEST_NEW, {
            requestId: request.id,
            title: selectedResult.title,
            user: phoneNumber?.slice(-4) || 'Unknown',
            status: 'SUBMITTED',
          });

          return { success: true, status: 'SUBMITTED' };
        } else {
          // Create FAILED request
          const request = await requestHistoryRepository.create({
            phoneNumberHash,
            phoneNumberEncrypted,
            mediaType,
            title: selectedResult.title,
            year: selectedResult.year ?? undefined,
            tmdbId: selectedResult.tmdbId ?? undefined,
            tvdbId: selectedResult.tvdbId ?? undefined,
            serviceType,
            serviceConfigId,
            status: 'FAILED',
            errorMessage: result.errorMessage,
            submittedAt: new Date().toISOString(),
          });

          // Send failure message
          if (phoneNumber) {
            const emoji = mediaType === 'movie' ? '🎬' : '📺';
            const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
            const message = `❌ Failed to submit your request.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\n${result.errorMessage || 'An error occurred. Please try again later.'}`;
            await whatsappClientService.sendMessage(phoneNumber, message);
          }

          // Emit WebSocket event
          webSocketService.emit(SocketEvents.REQUEST_NEW, {
            requestId: request.id,
            title: selectedResult.title,
            user: phoneNumber?.slice(-4) || 'Unknown',
            status: 'FAILED',
          });

          return { success: false, errorMessage: result.errorMessage, status: 'FAILED' };
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in createAndProcessRequest');
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        status: 'FAILED',
      };
    }
  }

  /**
   * Submit request to media service
   */
  private async submitToService(
    selectedResult: NormalizedResult,
    serviceType: ServiceType,
    baseUrl: string,
    apiKey: string,
    qualityProfileId: number,
    rootFolderPath: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const mediaType = selectedResult.mediaType;

      if (serviceType === 'overseerr') {
        const client = new OverseerrClient(baseUrl, apiKey);

        if (mediaType === 'movie' && selectedResult.tmdbId) {
          const radarrServers = await client.getRadarrServers();
          const defaultServer = radarrServers.find((s) => s.isDefault) || radarrServers[0];

          if (!defaultServer) {
            throw new Error('No Radarr server configured in Overseerr');
          }

          await client.requestMovie({
            mediaId: selectedResult.tmdbId,
            serverId: defaultServer.id,
            profileId: qualityProfileId,
            rootFolder: rootFolderPath,
          });
        } else if (mediaType === 'series' && selectedResult.tmdbId) {
          const sonarrServers = await client.getSonarrServers();
          const defaultServer = sonarrServers.find((s) => s.isDefault) || sonarrServers[0];

          if (!defaultServer) {
            throw new Error('No Sonarr server configured in Overseerr');
          }

          await client.requestSeries({
            mediaId: selectedResult.tmdbId,
            serverId: defaultServer.id,
            profileId: qualityProfileId,
            rootFolder: rootFolderPath,
          });
        }
      } else if (serviceType === 'radarr' && mediaType === 'movie') {
        const client = new RadarrClient(baseUrl, apiKey);

        if (!selectedResult.tmdbId) {
          throw new Error('Missing TMDB ID for movie request');
        }

        const titleSlug = `${selectedResult.title}-${selectedResult.tmdbId}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await client.addMovie({
          tmdbId: selectedResult.tmdbId,
          title: selectedResult.title,
          year: selectedResult.year ?? 0,
          titleSlug,
          qualityProfileId,
          rootFolderPath,
          monitored: true,
          searchForMovie: true,
        });
      } else if (serviceType === 'sonarr' && mediaType === 'series') {
        const client = new SonarrClient(baseUrl, apiKey);

        if (!selectedResult.tvdbId) {
          throw new Error('Missing TVDB ID for series request');
        }

        const titleSlug = `${selectedResult.title}-${selectedResult.tvdbId}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await client.addSeries({
          tvdbId: selectedResult.tvdbId,
          title: selectedResult.title,
          year: selectedResult.year ?? 0,
          titleSlug,
          qualityProfileId,
          rootFolderPath,
          monitored: true,
          searchForMissingEpisodes: true,
        });
      }

      return { success: true };
    } catch (error) {
      logger.error({ error }, 'Error submitting to service');
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const requestApprovalService = new RequestApprovalService();
