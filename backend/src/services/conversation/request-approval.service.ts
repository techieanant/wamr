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
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { quotaCheckService } from './quota-check.service.js';
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
    serviceConfigId: number,
    selectedSeasons?: number[],
    contactName?: string,
    replyJid?: string
  ): Promise<{ success: boolean; errorMessage?: string; status: string }> {
    // Use replyJid (full JID preserving @lid/@s.whatsapp.net) as primary target.
    // Fall back to phoneNumber only if JID is not available.
    const sendTarget = replyJid ?? phoneNumber;
    try {
      // Get auto-approval mode from the active WhatsApp connection (admin's connection)
      // Note: We use getActive() because approval mode is a system-wide setting,
      // not per-user. The phoneNumberHash is for the requester, not the admin.
      const connection = await whatsappConnectionRepository.getActive();
      const autoApprovalMode = connection?.autoApprovalMode || 'auto_approve';
      const exceptionsEnabled = connection?.exceptionsEnabled || false;
      const exceptionContacts = connection?.exceptionContacts || [];

      // Check if this requester is in the exceptions list
      const isException = exceptionsEnabled && exceptionContacts.includes(phoneNumberHash);

      logger.info(
        {
          phoneNumberHash,
          autoApprovalMode,
          exceptionsEnabled,
          isException,
          connectionId: connection?.id,
        },
        'Processing request with approval mode and exceptions'
      );

      const phoneNumberEncrypted = phoneNumber ? encryptionService.encrypt(phoneNumber) : undefined;

      const mediaType: MediaType = selectedResult.mediaType === 'movie' ? 'movie' : 'series';

      // Get service type
      const service = await mediaServiceConfigRepository.findById(serviceConfigId);
      if (!service) {
        throw new Error('Service configuration not found');
      }

      const serviceType: ServiceType = service.serviceType;

      // Determine effective approval mode considering exceptions
      let effectiveApprovalMode = autoApprovalMode;
      if (exceptionsEnabled && isException) {
        if (autoApprovalMode === 'auto_approve') {
          effectiveApprovalMode = 'manual';
        } else if (autoApprovalMode === 'manual') {
          effectiveApprovalMode = 'auto_approve';
        } else if (autoApprovalMode === 'auto_deny') {
          effectiveApprovalMode = 'auto_approve';
        }
      }

      // Check quota before proceeding
      const quotaCheck = await quotaCheckService.checkQuota(phoneNumberHash);
      if (!quotaCheck.allowed) {
        const request = await requestHistoryRepository.create({
          phoneNumberHash,
          phoneNumberEncrypted,
          contactName,
          mediaType,
          title: selectedResult.title,
          year: selectedResult.year ?? undefined,
          tmdbId: selectedResult.tmdbId ?? undefined,
          tvdbId: selectedResult.tvdbId ?? undefined,
          serviceType,
          serviceConfigId,
          selectedSeasons,
          status: 'REJECTED',
          adminNotes: 'Quota limit reached',
          errorMessage: `Quota limit reached: ${quotaCheck.used}/${quotaCheck.max} ${quotaCheck.windowType}`,
          replyJid: replyJid ?? undefined,
        });

        logger.info(
          {
            phoneNumberHash: phoneNumberHash?.slice(-8),
            hasSendTarget: !!sendTarget,
            sendTargetPreview: sendTarget?.slice(-12),
          },
          'Quota rejection - sendTarget check'
        );

        if (sendTarget) {
          const message =
            quotaCheck.max === 0
              ? `❌ Requests are not allowed for your account.\n\nPlease contact the administrator.`
              : `❌ Request limit reached\n\n` +
                `You've used ${quotaCheck.used}/${quotaCheck.max} requests for this ${quotaCheck.windowType}.\n` +
                `Your quota resets ${quotaCheck.resetTime}.\n\n` +
                `Try again then!`;
          logger.info(
            { sendTarget: sendTarget.slice(-12), messageLen: message.length },
            'Quota rejection - sending message'
          );
          await whatsappClientService.sendMessage(sendTarget, message);
        } else {
          logger.warn(
            { phoneNumberHash: phoneNumberHash?.slice(-8) },
            'Quota rejection - no sendTarget, message will not be delivered'
          );
        }

        webSocketService.emit(SocketEvents.REQUEST_NEW, {
          requestId: request.id,
          title: selectedResult.title,
          user: phoneNumber?.slice(-4) || 'Unknown',
          status: 'REJECTED',
        });

        return {
          success: false,
          errorMessage: `Quota limit reached: ${quotaCheck.used}/${quotaCheck.max} ${quotaCheck.windowType}`,
          status: 'REJECTED',
        };
      }

      // Handle based on effective approval mode
      if (effectiveApprovalMode === 'auto_deny') {
        // Auto-deny: Create REJECTED request and notify user
        const request = await requestHistoryRepository.create({
          phoneNumberHash,
          phoneNumberEncrypted,
          contactName,
          mediaType,
          title: selectedResult.title,
          year: selectedResult.year ?? undefined,
          tmdbId: selectedResult.tmdbId ?? undefined,
          tvdbId: selectedResult.tvdbId ?? undefined,
          serviceType,
          serviceConfigId,
          selectedSeasons,
          status: 'REJECTED',
          adminNotes: 'Auto-rejected by system settings',
          errorMessage: 'Automatic approval is currently disabled. Contact the administrator.',
          replyJid: replyJid ?? undefined,
        });

        // Send rejection message
        if (sendTarget) {
          const emoji = mediaType === 'movie' ? '🎬' : '📺';
          const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
          const message = `❌ Your request was automatically declined.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\nReason: Automatic approval is currently disabled.`;
          await whatsappClientService.sendMessage(sendTarget, message);
        }

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_NEW, {
          requestId: request.id,
          title: selectedResult.title,
          user: phoneNumber?.slice(-4) || 'Unknown',
          status: 'REJECTED',
        });

        return { success: false, errorMessage: 'Request auto-rejected', status: 'REJECTED' };
      } else if (effectiveApprovalMode === 'manual') {
        // Manual mode: Create PENDING request
        const request = await requestHistoryRepository.create({
          phoneNumberHash,
          phoneNumberEncrypted,
          contactName,
          mediaType,
          title: selectedResult.title,
          year: selectedResult.year ?? undefined,
          tmdbId: selectedResult.tmdbId ?? undefined,
          tvdbId: selectedResult.tvdbId ?? undefined,
          serviceType,
          serviceConfigId,
          selectedSeasons,
          status: 'PENDING',
          replyJid: replyJid ?? undefined,
        });

        // Send pending message
        if (sendTarget) {
          const emoji = mediaType === 'movie' ? '🎬' : '📺';
          const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
          const message = `⏳ Your request is pending approval.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\nYou will be notified once an administrator reviews your request.`;
          await whatsappClientService.sendMessage(sendTarget, message);
        }

        // Emit WebSocket event
        webSocketService.emit(SocketEvents.REQUEST_NEW, {
          requestId: request.id,
          title: selectedResult.title,
          user: phoneNumber?.slice(-4) || 'Unknown',
          status: 'PENDING',
        });

        // Send admin WhatsApp notification for new pending request
        try {
          await adminNotificationService.notifyNewRequest(request);
        } catch (notifyError) {
          logger.error(
            { error: notifyError, requestId: request.id },
            'Failed to send admin notification'
          );
        }

        return { success: true, status: 'PENDING' };
      } else {
        // Auto-approve: Submit directly
        const result = await this.submitToService(
          selectedResult,
          service.serviceType,
          service.baseUrl,
          encryptionService.decrypt(service.apiKeyEncrypted),
          service.qualityProfileId ?? 1,
          // For seerr (Overseerr), if no rootFolderPath is configured, pass null so we
          // omit the field and let Overseerr use its own server defaults (avoids Windows path issues).
          service.serviceType === 'seerr'
            ? (service.rootFolderPath ?? null)
            : service.rootFolderPath || (mediaType === 'movie' ? '/movies' : '/tv'),
          selectedSeasons,
          service.allowInsecure ?? false
        );

        if (result.success) {
          // Create SUBMITTED request
          const request = await requestHistoryRepository.create({
            phoneNumberHash,
            phoneNumberEncrypted,
            contactName,
            mediaType,
            title: selectedResult.title,
            year: selectedResult.year ?? undefined,
            tmdbId: selectedResult.tmdbId ?? undefined,
            tvdbId: selectedResult.tvdbId ?? undefined,
            serviceType,
            serviceConfigId,
            selectedSeasons,
            status: 'SUBMITTED',
            submittedAt: new Date().toISOString(),
            replyJid: replyJid ?? undefined,
          });

          // Send success message
          if (sendTarget) {
            const emoji = mediaType === 'movie' ? '🎬' : '📺';
            const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
            const message = `✅ Request submitted successfully!\n\n${emoji} *${selectedResult.title}${yearStr}* has been added to the queue.\n\nYou will be notified when it's available.`;
            await whatsappClientService.sendMessage(sendTarget, message);
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
            contactName,
            mediaType,
            title: selectedResult.title,
            year: selectedResult.year ?? undefined,
            tmdbId: selectedResult.tmdbId ?? undefined,
            tvdbId: selectedResult.tvdbId ?? undefined,
            serviceType,
            serviceConfigId,
            selectedSeasons,
            status: 'FAILED',
            errorMessage: result.errorMessage,
            submittedAt: new Date().toISOString(),
            replyJid: replyJid ?? undefined,
          });

          // Send failure message
          if (sendTarget) {
            const emoji = mediaType === 'movie' ? '🎬' : '📺';
            const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
            const message = `❌ Failed to submit your request.\n\n${emoji} *${selectedResult.title}${yearStr}*\n\n${result.errorMessage || 'An error occurred. Please try again later.'}`;
            await whatsappClientService.sendMessage(sendTarget, message);
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
    rootFolderPath: string | null,
    selectedSeasons?: number[],
    allowInsecure = false
  ): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const mediaType = selectedResult.mediaType;

      if (serviceType === 'seerr') {
        const client = new OverseerrClient(baseUrl, apiKey, allowInsecure);

        if (mediaType === 'movie' && selectedResult.tmdbId) {
          const radarrServers = await client.getRadarrServers();
          const defaultServer = radarrServers.find((s) => s.isDefault) || radarrServers[0];

          if (!defaultServer) {
            throw new Error(`No Radarr server configured in Seerr`);
          }

          await client.requestMovie({
            mediaId: selectedResult.tmdbId,
            serverId: defaultServer.id,
            profileId: qualityProfileId,
            // Pass undefined when not configured so Overseerr uses its own server defaults.
            // This avoids injecting Linux-style paths into Windows-hosted Sonarr/Radarr.
            rootFolder: rootFolderPath ?? undefined,
          });
        } else if (mediaType === 'series' && selectedResult.tmdbId) {
          const sonarrServers = await client.getSonarrServers();
          const defaultServer = sonarrServers.find((s) => s.isDefault) || sonarrServers[0];

          if (!defaultServer) {
            throw new Error(`No Sonarr server configured in Seerr`);
          }

          await client.requestSeries({
            mediaId: selectedResult.tmdbId,
            serverId: defaultServer.id,
            profileId: qualityProfileId,
            rootFolder: rootFolderPath ?? undefined,
            seasons: selectedSeasons && selectedSeasons.length > 0 ? selectedSeasons : 'all',
          });
        }
      } else if (serviceType === 'radarr' && mediaType === 'movie') {
        const client = new RadarrClient(baseUrl, apiKey, allowInsecure);

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
          rootFolderPath: rootFolderPath || '/movies',
          monitored: true,
          searchForMovie: true,
        });
      } else if (serviceType === 'sonarr' && mediaType === 'series') {
        const client = new SonarrClient(baseUrl, apiKey, allowInsecure);

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
          rootFolderPath: rootFolderPath || '/tv',
          monitored: true,
          searchForMissingEpisodes: true,
        });
      } else if (serviceType === 'radarr' && mediaType === 'series') {
        throw new Error(
          "Sorry, the configured service (Radarr) can't handle TV series requests. Please contact your admin."
        );
      } else if (serviceType === 'sonarr' && mediaType === 'movie') {
        throw new Error(
          "Sorry, the configured service (Sonarr) can't handle movie requests. Please contact your admin."
        );
      }

      return { success: true };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check for 409 Conflict errors specifically
      if ((error as any)?.statusCode === 409 || (error as any)?.response?.status === 409) {
        errorMessage = 'This movie/series is already requested or available in your library.';
        logger.error(
          { error, statusCode: (error as any)?.statusCode || (error as any)?.response?.status },
          'Conflict error (409) submitting to service'
        );
      } else if ((error as any)?.response?.status === 400) {
        // Radarr/Sonarr return 400 with a message body when media already exists
        const responseData = (error as any)?.response?.data;
        const responseMsg: string =
          typeof responseData === 'string'
            ? responseData
            : responseData?.message || responseData?.errorMessage || JSON.stringify(responseData);
        if (responseMsg && responseMsg.toLowerCase().includes('already')) {
          errorMessage = '✅ This media is already available on the server!';
          logger.info({ error }, 'Media already exists (400) submitting to service');
        } else {
          logger.error({ error }, 'Bad request (400) submitting to service');
        }
      } else {
        logger.error({ error }, 'Error submitting to service');
      }

      return {
        success: false,
        errorMessage,
      };
    }
  }
}

// Export singleton instance
export const requestApprovalService = new RequestApprovalService();
