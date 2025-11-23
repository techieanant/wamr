import type { Request, Response, NextFunction } from 'express';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { logger } from '../../config/logger.js';
import { encryptionService } from '../../services/encryption/encryption.service.js';
import { whatsappClientService } from '../../services/whatsapp/whatsapp-client.service.js';
import { webSocketService, SocketEvents } from '../../services/websocket/websocket.service.js';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { OverseerrClient } from '../../services/integrations/overseerr.client.js';
import { RadarrClient } from '../../services/integrations/radarr.client.js';
import { SonarrClient } from '../../services/integrations/sonarr.client.js';

/**
 * Get all requests with pagination
 */
export const getAllRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string | undefined;

    let requests;

    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'SUBMITTED', 'FAILED'].includes(status)) {
      requests = await requestHistoryRepository.findByStatus(
        status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'FAILED'
      );
    } else {
      requests = await requestHistoryRepository.findAll();
    }

    // Simple pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRequests = requests.slice(startIndex, endIndex);

    res.json({
      requests: paginatedRequests,
      pagination: {
        page,
        limit,
        total: requests.length,
        totalPages: Math.ceil(requests.length / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get requests');
    next(error);
  }
};

/**
 * Get request by ID
 */
export const getRequestById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      res.status(400).json({ error: 'Invalid request ID' });
      return;
    }

    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    res.json(request);
  } catch (error) {
    logger.error({ error, requestId: req.params.id }, 'Failed to get request');
    next(error);
  }
};

/**
 * Delete request by ID
 */
export const deleteRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      res.status(400).json({ error: 'Invalid request ID' });
      return;
    }

    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    await requestHistoryRepository.delete(requestId);

    logger.info({ requestId, title: request.title }, 'Request deleted successfully');

    res.json({
      success: true,
      message: 'Request deleted successfully',
    });
  } catch (error) {
    logger.error({ error, requestId: req.params.id }, 'Failed to delete request');
    next(error);
  }
};

/**
 * Update request status
 */
export const updateRequestStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, adminNotes } = req.body;

    if (isNaN(requestId)) {
      res.status(400).json({ error: 'Invalid request ID' });
      return;
    }

    if (!status || !['PENDING', 'APPROVED', 'REJECTED', 'SUBMITTED', 'FAILED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    await requestHistoryRepository.update(requestId, {
      status,
      adminNotes: adminNotes || request.adminNotes,
      updatedAt: new Date().toISOString(),
    });

    logger.info({ requestId, status }, 'Request status updated');

    res.json({
      success: true,
      message: 'Request status updated successfully',
    });
  } catch (error) {
    logger.error({ error, requestId: req.params.id }, 'Failed to update request status');
    next(error);
  }
};

/**
 * Approve a pending request and submit to service
 */
export const approveRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestId = parseInt(req.params.id);

    if (isNaN(requestId)) {
      res.status(400).json({ error: 'Invalid request ID' });
      return;
    }

    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status !== 'PENDING' && request.status !== 'FAILED') {
      res.status(400).json({ error: 'Request must be in PENDING or FAILED status to approve' });
      return;
    }

    // Get service configuration
    if (!request.serviceConfigId) {
      res.status(400).json({ error: 'Request has no service configuration' });
      return;
    }

    const service = await mediaServiceConfigRepository.findById(request.serviceConfigId);
    if (!service || !service.enabled) {
      res.status(400).json({ error: 'Service not found or disabled' });
      return;
    }

    // Decrypt API key
    const apiKey = encryptionService.decrypt(service.apiKeyEncrypted);

    try {
      // Submit to appropriate service
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

          // Get selected seasons (stored as JSON in database)
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

      // Update request status to SUBMITTED
      await requestHistoryRepository.update(requestId, {
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      });

      // Send WhatsApp notification
      if (request.phoneNumberEncrypted) {
        try {
          const phoneNumber = encryptionService.decrypt(request.phoneNumberEncrypted);
          const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
          const yearStr = request.year ? ` (${request.year})` : '';
          const message = `✅ Your request has been approved!\n\n${emoji} *${request.title}${yearStr}* has been added to the queue.\n\nYou will be notified when it's available.`;

          await whatsappClientService.sendMessage(phoneNumber, message);
          logger.info(
            { requestId, phoneNumber: phoneNumber.slice(-4) },
            'Approval notification sent'
          );
        } catch (error) {
          logger.error({ error, requestId }, 'Failed to send approval notification');
        }
      }

      // Emit WebSocket event
      webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
        requestId,
        status: 'SUBMITTED',
        previousStatus: request.status,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        { requestId, title: request.title },
        'Request approved and submitted successfully'
      );

      res.json({
        success: true,
        message: 'Request approved and submitted successfully',
      });
    } catch (error) {
      // Update to FAILED status
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await requestHistoryRepository.update(requestId, {
        status: 'FAILED',
        errorMessage,
        updatedAt: new Date().toISOString(),
      });

      // Emit WebSocket event
      webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
        requestId,
        status: 'FAILED',
        previousStatus: request.status,
        errorMessage,
        timestamp: new Date().toISOString(),
      });

      logger.error({ error, requestId }, 'Failed to submit approved request');

      res.status(500).json({
        success: false,
        error: 'Failed to submit request to service',
        details: errorMessage,
      });
    }
  } catch (error) {
    logger.error({ error, requestId: req.params.id }, 'Failed to approve request');
    next(error);
  }
};

/**
 * Reject a pending request
 */
export const rejectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestId = parseInt(req.params.id);
    const { reason } = req.body;

    if (isNaN(requestId)) {
      res.status(400).json({ error: 'Invalid request ID' });
      return;
    }

    const request = await requestHistoryRepository.findById(requestId);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.status !== 'PENDING' && request.status !== 'FAILED') {
      res.status(400).json({ error: 'Request must be in PENDING or FAILED status to reject' });
      return;
    }

    // Update request status to REJECTED
    await requestHistoryRepository.update(requestId, {
      status: 'REJECTED',
      adminNotes: reason || 'Request rejected by administrator',
      updatedAt: new Date().toISOString(),
    });

    // Send WhatsApp notification
    if (request.phoneNumberEncrypted) {
      try {
        const phoneNumber = encryptionService.decrypt(request.phoneNumberEncrypted);
        const emoji = request.mediaType === 'movie' ? '🎬' : '📺';
        const yearStr = request.year ? ` (${request.year})` : '';
        const reasonText = reason ? `\n\nReason: ${reason}` : '';
        const message = `❌ Your request was declined by administrator.\n\n${emoji} *${request.title}${yearStr}*${reasonText}`;

        await whatsappClientService.sendMessage(phoneNumber, message);
        logger.info(
          { requestId, phoneNumber: phoneNumber.slice(-4) },
          'Rejection notification sent'
        );
      } catch (error) {
        logger.error({ error, requestId }, 'Failed to send rejection notification');
      }
    }

    // Emit WebSocket event
    webSocketService.emit(SocketEvents.REQUEST_STATUS_UPDATE, {
      requestId,
      status: 'REJECTED',
      previousStatus: request.status,
      timestamp: new Date().toISOString(),
    });

    logger.info({ requestId, title: request.title }, 'Request rejected');

    res.json({
      success: true,
      message: 'Request rejected successfully',
    });
  } catch (error) {
    logger.error({ error, requestId: req.params.id }, 'Failed to reject request');
    next(error);
  }
};
