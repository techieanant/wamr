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
import { RadarrClient } from '../integrations/radarr.client.js';
import { SonarrClient } from '../integrations/sonarr.client.js';
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
      logger.warn('Media monitoring already running, skipping start');
      return;
    }

    this.isMonitoring = true;
    logger.info(
      {
        intervalMs: this.CHECK_INTERVAL_MS,
        intervalMinutes: parseFloat((this.CHECK_INTERVAL_MS / 60000).toFixed(2)),
      },
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

    let availabilityInfo: {
      isAvailable: boolean;
      isPartial?: boolean;
      availableSeasons?: number[];
      availableEpisodes?: Record<number, number[]>;
      totalSeasons?: number;
    } = { isAvailable: false };

    try {
      if (service.serviceType === 'overseerr') {
        availabilityInfo = await this.checkOverseerrStatus(service.baseUrl, apiKey, request);
      } else if (service.serviceType === 'radarr' && request.mediaType === 'movie') {
        const isAvailable = await this.checkRadarrStatus(service.baseUrl, apiKey, request);
        availabilityInfo = { isAvailable };
      } else if (service.serviceType === 'sonarr' && request.mediaType === 'series') {
        const sonarrInfo = await this.checkSonarrStatus(service.baseUrl, apiKey, request);
        availabilityInfo = sonarrInfo;
      }

      // Handle series with season tracking
      if (request.mediaType === 'series' && availabilityInfo.availableSeasons) {
        await this.handleSeriesSeasonUpdates(request, availabilityInfo);

        // Also handle episode-level notifications if we have episode data
        if (availabilityInfo.availableEpisodes) {
          await this.handleEpisodeUpdates(request, availabilityInfo.availableEpisodes);
        }
      } else if (availabilityInfo.isAvailable && request.mediaType === 'movie') {
        // Movies - simple notification
        logger.info({ requestId: request.id, title: request.title }, 'Movie is now available!');

        await requestHistoryRepository.update(request.id, {
          status: 'APPROVED',
          updatedAt: new Date().toISOString(),
        });

        await this.notifyUserMediaAvailable(request, availabilityInfo);
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
  ): Promise<{
    isAvailable: boolean;
    isPartial?: boolean;
    availableSeasons?: number[];
    totalSeasons?: number;
  }> {
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
        return { isAvailable: false };
      }

      const status = match.mediaInfo?.status;

      // Status 5 = fully available, Status 4 = partially available
      const isFullyAvailable = status === 5;
      const isPartiallyAvailable = status === 4;

      // If it's a TV series and partially available, get season details
      if (isPartiallyAvailable && request.mediaType === 'series' && request.tmdbId) {
        try {
          const tvDetails = await client.getTvDetails(request.tmdbId);
          const availableSeasons: number[] = [];
          const totalSeasons = tvDetails.seasons.filter((s: any) => s.seasonNumber > 0).length;

          // Check which seasons are available
          if (tvDetails.mediaInfo?.seasons) {
            for (const season of tvDetails.mediaInfo.seasons) {
              // Season status 5 = fully available, 4 = partially available
              // We accept both because Sonarr will verify actual episode completion
              if (season.status === 5 || season.status === 4) {
                availableSeasons.push(season.seasonNumber);
              }
            }
          }

          logger.debug(
            {
              requestId: request.id,
              status,
              availableSeasons,
              totalSeasons,
            },
            'Overseerr TV series partially available'
          );

          return {
            isAvailable: true,
            isPartial: true,
            availableSeasons: availableSeasons.length > 0 ? availableSeasons : undefined,
            totalSeasons,
          };
        } catch (error) {
          logger.error(
            { error, requestId: request.id },
            'Error fetching TV details for partial availability'
          );
          // Fall back to basic partial availability notification
          return {
            isAvailable: true,
            isPartial: true,
          };
        }
      }

      // Check for fully available TV series to get total seasons
      if (isFullyAvailable && request.mediaType === 'series' && request.tmdbId) {
        try {
          const tvDetails = await client.getTvDetails(request.tmdbId);
          const availableSeasons: number[] = [];
          const totalSeasons = tvDetails.seasons.filter((s: any) => s.seasonNumber > 0).length;

          if (tvDetails.mediaInfo?.seasons) {
            for (const season of tvDetails.mediaInfo.seasons) {
              // Season status 5 = fully available, 4 = partially available
              // We accept both because Sonarr will verify actual episode completion
              if (season.status === 5 || season.status === 4) {
                availableSeasons.push(season.seasonNumber);
              }
            }
          }

          return {
            isAvailable: true,
            isPartial: false,
            availableSeasons: availableSeasons.length > 0 ? availableSeasons : undefined,
            totalSeasons,
          };
        } catch (error) {
          logger.error({ error, requestId: request.id }, 'Error fetching TV details');
        }
      }

      logger.debug(
        { requestId: request.id, status, isAvailable: isFullyAvailable || isPartiallyAvailable },
        'Overseerr media status'
      );

      return {
        isAvailable: isFullyAvailable || isPartiallyAvailable,
        isPartial: isPartiallyAvailable,
      };
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error checking Overseerr status');
      return { isAvailable: false };
    }
  }

  /**
   * Handle episode-level updates for TV series
   * Notifies when new episodes become available
   */
  private async handleEpisodeUpdates(
    request: any,
    availableEpisodes: Record<number, number[]>
  ): Promise<void> {
    const notifiedEpisodes: Record<string, number[]> = request.notifiedEpisodes || {};

    logger.debug(
      {
        requestId: request.id,
        availableEpisodes,
        notifiedEpisodes,
      },
      'Checking episode updates'
    );

    const newEpisodes: Array<{ season: number; episode: number }> = [];

    // Find newly available episodes that haven't been notified yet
    for (const [seasonStr, episodeNumbers] of Object.entries(availableEpisodes)) {
      const seasonNum = parseInt(seasonStr, 10);
      const notified = notifiedEpisodes[seasonStr] || [];

      for (const episodeNum of episodeNumbers) {
        if (!notified.includes(episodeNum)) {
          newEpisodes.push({ season: seasonNum, episode: episodeNum });
        }
      }
    }

    if (newEpisodes.length === 0) {
      logger.debug({ requestId: request.id }, 'No new episodes to notify about');
      return;
    }

    // Sort by season then episode
    newEpisodes.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.episode - b.episode;
    });

    logger.info(
      {
        requestId: request.id,
        title: request.title,
        newEpisodeCount: newEpisodes.length,
        episodes: newEpisodes,
      },
      'New episodes available - notifying user'
    );

    // Send notification
    await this.notifyUserEpisodesAvailable(request, newEpisodes);

    // Update notified episodes
    const updatedNotifiedEpisodes = { ...notifiedEpisodes };
    for (const { season, episode } of newEpisodes) {
      const seasonKey = season.toString();
      if (!updatedNotifiedEpisodes[seasonKey]) {
        updatedNotifiedEpisodes[seasonKey] = [];
      }
      if (!updatedNotifiedEpisodes[seasonKey].includes(episode)) {
        updatedNotifiedEpisodes[seasonKey].push(episode);
      }
    }

    // Sort episode numbers within each season
    for (const seasonKey in updatedNotifiedEpisodes) {
      updatedNotifiedEpisodes[seasonKey].sort((a, b) => a - b);
    }

    await requestHistoryRepository.update(request.id, {
      notifiedEpisodes: updatedNotifiedEpisodes,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Notify user about newly available episodes
   */
  private async notifyUserEpisodesAvailable(
    request: any,
    episodes: Array<{ season: number; episode: number }>
  ): Promise<void> {
    try {
      const phoneNumber = await this.getPhoneNumber(request);
      if (!phoneNumber) return;

      const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
      const yearStr = request.year ? ` (${request.year})` : '';

      let message: string;

      if (episodes.length === 1) {
        // Single episode notification
        const { season, episode } = episodes[0];
        message =
          `📺 *New Episode Available!*\n\n` +
          `*${request.title}${yearStr}*\n\n` +
          `✨ Season ${season} Episode ${episode} is now ready to watch!\n\n` +
          `Enjoy! 🍿`;
      } else if (episodes.length <= 5) {
        // Small batch - list all episodes
        const episodeList = episodes
          .map(({ season, episode }) => `S${season}E${episode}`)
          .join(', ');

        message =
          `📺 *${episodes.length} New Episodes Available!*\n\n` +
          `*${request.title}${yearStr}*\n\n` +
          `✨ Episodes ${episodeList} are now ready to watch!\n\n` +
          `Happy binge-watching! 🍿`;
      } else {
        // Large batch - group by season
        const bySeason: Record<number, number[]> = {};
        for (const { season, episode } of episodes) {
          if (!bySeason[season]) bySeason[season] = [];
          bySeason[season].push(episode);
        }

        const seasonSummary = Object.entries(bySeason)
          .map(([season, eps]) => {
            if (eps.length === 1) {
              return `Season ${season} Episode ${eps[0]}`;
            } else {
              return `Season ${season}: ${eps.length} episodes`;
            }
          })
          .join('\n');

        message =
          `📺 *${episodes.length} New Episodes Available!*\n\n` +
          `*${request.title}${yearStr}*\n\n` +
          `${seasonSummary}\n\n` +
          `Happy binge-watching! 🍿`;
      }

      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.info(
        {
          requestId: request.id,
          title: request.title,
          episodeCount: episodes.length,
          phoneNumber: phoneNumber.slice(-4),
        },
        'Sent episode availability notification to user'
      );
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error sending episode notification');
    }
  }

  /**
   * Handle season-level updates for TV series
   * This handles both:
   * 1. Notifying when additional requested seasons become available
   * 2. Notifying when new seasons are released beyond the original request
   */
  private async handleSeriesSeasonUpdates(
    request: any,
    availabilityInfo: {
      isAvailable: boolean;
      isPartial?: boolean;
      availableSeasons?: number[];
      totalSeasons?: number;
    }
  ): Promise<void> {
    const requestedSeasons: number[] = request.selectedSeasons || [];
    const notifiedSeasons: number[] = request.notifiedSeasons || [];
    const availableSeasons = availabilityInfo.availableSeasons || [];
    const currentTotalSeasons = availabilityInfo.totalSeasons || 0;
    const previousTotalSeasons = request.totalSeasons || 0;

    logger.debug(
      {
        requestId: request.id,
        requestedSeasons,
        notifiedSeasons,
        availableSeasons,
        currentTotalSeasons,
        previousTotalSeasons,
      },
      'Checking series season updates'
    );

    // Find newly available seasons that haven't been notified yet
    const newlyAvailableSeasons = availableSeasons.filter(
      (season) => !notifiedSeasons.includes(season)
    );

    if (newlyAvailableSeasons.length === 0 && currentTotalSeasons <= previousTotalSeasons) {
      logger.debug({ requestId: request.id }, 'No new seasons to notify about');
      return;
    }

    // Feature 1: Notify about newly available REQUESTED seasons
    const newlyAvailableRequestedSeasons = newlyAvailableSeasons.filter((season) =>
      requestedSeasons.includes(season)
    );

    if (newlyAvailableRequestedSeasons.length > 0) {
      logger.info(
        {
          requestId: request.id,
          title: request.title,
          seasons: newlyAvailableRequestedSeasons,
        },
        'Requested seasons newly available - notifying user'
      );

      await this.notifyUserSeasonsAvailable(request, newlyAvailableRequestedSeasons, 'requested');

      // Update notified seasons
      const updatedNotifiedSeasons = [...notifiedSeasons, ...newlyAvailableRequestedSeasons];
      await requestHistoryRepository.update(request.id, {
        notifiedSeasons: updatedNotifiedSeasons,
        totalSeasons: currentTotalSeasons,
        updatedAt: new Date().toISOString(),
      });
    }

    // Feature 2: Detect and notify about NEW seasons beyond the original request
    if (currentTotalSeasons > previousTotalSeasons && previousTotalSeasons > 0) {
      // New season(s) have been released!
      const newSeasonNumbers: number[] = [];
      for (let i = previousTotalSeasons + 1; i <= currentTotalSeasons; i++) {
        newSeasonNumbers.push(i);
      }

      logger.info(
        {
          requestId: request.id,
          title: request.title,
          newSeasons: newSeasonNumbers,
          previousTotal: previousTotalSeasons,
          currentTotal: currentTotalSeasons,
        },
        'New seasons released - notifying user'
      );

      await this.notifyUserNewSeasonReleased(request, newSeasonNumbers);

      // Update total seasons count
      await requestHistoryRepository.update(request.id, {
        totalSeasons: currentTotalSeasons,
        updatedAt: new Date().toISOString(),
      });
    } else if (currentTotalSeasons > 0 && previousTotalSeasons === 0) {
      // First time we're tracking total seasons - initialize
      await requestHistoryRepository.update(request.id, {
        totalSeasons: currentTotalSeasons,
        updatedAt: new Date().toISOString(),
      });
    }

    // Feature 2 (alternative): Notify about new seasons that are already AVAILABLE but weren't requested
    const newAvailableUnrequestedSeasons = newlyAvailableSeasons.filter(
      (season) => !requestedSeasons.includes(season) && season > Math.max(...requestedSeasons, 0)
    );

    if (newAvailableUnrequestedSeasons.length > 0) {
      logger.info(
        {
          requestId: request.id,
          title: request.title,
          seasons: newAvailableUnrequestedSeasons,
        },
        'New seasons available (beyond request) - notifying user'
      );

      await this.notifyUserSeasonsAvailable(request, newAvailableUnrequestedSeasons, 'new-release');

      // Update notified seasons
      const updatedNotifiedSeasons = [...notifiedSeasons, ...newAvailableUnrequestedSeasons];
      await requestHistoryRepository.update(request.id, {
        notifiedSeasons: updatedNotifiedSeasons,
        totalSeasons: currentTotalSeasons,
        updatedAt: new Date().toISOString(),
      });
    }

    // Check if all requested seasons are now available
    const allRequestedAvailable =
      requestedSeasons.length > 0 &&
      requestedSeasons.every((season) => availableSeasons.includes(season));

    if (allRequestedAvailable && request.status === 'SUBMITTED') {
      logger.info(
        { requestId: request.id, title: request.title },
        'All requested seasons now available - marking as APPROVED'
      );

      await requestHistoryRepository.update(request.id, {
        status: 'APPROVED',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Notify user about newly available seasons (requested or new releases)
   */
  private async notifyUserSeasonsAvailable(
    request: any,
    seasons: number[],
    type: 'requested' | 'new-release'
  ): Promise<void> {
    try {
      const phoneNumber = await this.getPhoneNumber(request);
      if (!phoneNumber) return;

      const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
      const yearStr = request.year ? ` (${request.year})` : '';
      const sortedSeasons = seasons.sort((a, b) => a - b);
      const seasonList =
        sortedSeasons.length === 1
          ? `Season ${sortedSeasons[0]}`
          : sortedSeasons.length === 2
            ? `Seasons ${sortedSeasons[0]} and ${sortedSeasons[1]}`
            : `Seasons ${sortedSeasons.slice(0, -1).join(', ')} and ${sortedSeasons[sortedSeasons.length - 1]}`;

      let message: string;

      if (type === 'requested') {
        message =
          `🎉 *Great news!*\n\n` +
          `📺 *${request.title}${yearStr}*\n\n` +
          `✅ ${seasonList} ${seasons.length === 1 ? 'is' : 'are'} now available in your library!\n\n` +
          `You can start watching ${seasons.length === 1 ? 'it' : 'them'} now.`;
      } else {
        // new-release
        message =
          `🆕 *New Season Alert!*\n\n` +
          `📺 *${request.title}${yearStr}*\n\n` +
          `🎬 ${seasonList} ${seasons.length === 1 ? 'has' : 'have'} been released and ${seasons.length === 1 ? 'is' : 'are'} now available!\n\n` +
          `This ${seasons.length === 1 ? "wasn't" : "weren't"} part of your original request, but we thought you'd like to know!`;
      }

      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.info(
        {
          requestId: request.id,
          title: request.title,
          seasons,
          type,
          phoneNumber: phoneNumber.slice(-4),
        },
        'Sent season availability notification to user'
      );
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error sending season notification');
    }
  }

  /**
   * Notify user about new season release (not yet available but announced)
   */
  private async notifyUserNewSeasonReleased(request: any, newSeasons: number[]): Promise<void> {
    try {
      const phoneNumber = await this.getPhoneNumber(request);
      if (!phoneNumber) return;

      const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
      const yearStr = request.year ? ` (${request.year})` : '';
      const seasonList =
        newSeasons.length === 1 ? `Season ${newSeasons[0]}` : `Seasons ${newSeasons.join(', ')}`;

      const message =
        `🆕 *New Season Announcement!*\n\n` +
        `📺 *${request.title}${yearStr}*\n\n` +
        `🎬 ${seasonList} ${newSeasons.length === 1 ? 'has' : 'have'} been announced!\n\n` +
        `${newSeasons.length === 1 ? 'It' : 'They'} may not be available yet, but we'll let you know when ${newSeasons.length === 1 ? 'it is' : 'they are'}!`;

      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.info(
        {
          requestId: request.id,
          title: request.title,
          seasons: newSeasons,
          phoneNumber: phoneNumber.slice(-4),
        },
        'Sent new season announcement to user'
      );
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error sending new season announcement');
    }
  }

  /**
   * Get phone number for notifications (helper method)
   */
  private async getPhoneNumber(request: any): Promise<string | null> {
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
      const session = await conversationSessionRepository.findByPhoneHash(request.phoneNumberHash);

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
    }

    return phoneNumber;
  }

  /**
   * Check Radarr for movie availability
   */
  private async checkRadarrStatus(baseUrl: string, apiKey: string, request: any): Promise<boolean> {
    const client = new RadarrClient(baseUrl, apiKey);

    try {
      // Get movie by TMDB ID
      if (!request.tmdbId) {
        logger.warn({ requestId: request.id }, 'Request missing TMDB ID for Radarr check');
        return false;
      }

      const movie = await client.getMovieByTmdbId(request.tmdbId);

      if (!movie) {
        logger.debug(
          { requestId: request.id, tmdbId: request.tmdbId },
          'Movie not found in Radarr'
        );
        return false;
      }

      // Check if movie has file (hasFile indicates the movie is downloaded and available)
      const isAvailable = movie.hasFile === true;

      logger.debug(
        {
          requestId: request.id,
          title: movie.title,
          hasFile: movie.hasFile,
          monitored: movie.monitored,
          isAvailable,
        },
        'Radarr movie status'
      );

      return isAvailable;
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error checking Radarr status');
      return false;
    }
  }

  /**
   * Check Sonarr for series availability
   */
  private async checkSonarrStatus(
    baseUrl: string,
    apiKey: string,
    request: any
  ): Promise<{
    isAvailable: boolean;
    isPartial?: boolean;
    availableSeasons?: number[];
    availableEpisodes?: Record<number, number[]>;
    totalSeasons?: number;
  }> {
    const client = new SonarrClient(baseUrl, apiKey);

    try {
      // Get series by TVDB ID
      if (!request.tvdbId) {
        logger.warn({ requestId: request.id }, 'Request missing TVDB ID for Sonarr check');
        return { isAvailable: false };
      }

      const series = await client.getSeriesByTvdbId(request.tvdbId);

      if (!series) {
        logger.debug(
          { requestId: request.id, tvdbId: request.tvdbId },
          'Series not found in Sonarr'
        );
        return { isAvailable: false };
      }

      // Check if series has any downloaded episodes
      const episodeFileCount = series.statistics?.episodeFileCount ?? 0;
      const isAvailable = episodeFileCount > 0;

      // Try to get season-level details
      let availableSeasons: number[] = [];
      const totalSeasons = series.seasons?.length ?? 0;

      if (series.seasons) {
        availableSeasons = series.seasons
          .filter((season: any) => {
            // Season is available if ALL AIRED episodes are downloaded
            // episodeFileCount = number of downloaded episodes
            // episodeCount = number of episodes that have aired (not including future unaired episodes)
            // totalEpisodeCount = total episodes including future unaired ones
            const hasEpisodes = season.statistics?.episodeCount > 0;
            const allAiredEpisodesDownloaded =
              season.statistics?.episodeFileCount >= season.statistics?.episodeCount;

            return hasEpisodes && allAiredEpisodesDownloaded;
          })
          .map((season: any) => season.seasonNumber)
          .filter((num: number) => num > 0); // Exclude season 0 (specials)
      }

      // NEW: Get episode-level availability for Sonarr (get actual seriesId first)
      let availableEpisodes: Record<number, number[]> | undefined;

      // Find the Sonarr series ID (from the series list, it should have an ID)
      try {
        const allSeries = await client.getSeries();
        const fullSeries = allSeries.find((s) => s.tvdbId === request.tvdbId);

        if (fullSeries && (fullSeries as any).id) {
          availableEpisodes = await client.getAvailableEpisodesBySeason((fullSeries as any).id);
          logger.debug(
            {
              requestId: request.id,
              episodeCount: Object.values(availableEpisodes).flat().length,
            },
            'Fetched episode-level availability from Sonarr'
          );
        }
      } catch (error) {
        logger.warn(
          { error, requestId: request.id },
          'Failed to fetch episode-level data from Sonarr'
        );
        // Continue without episode data
      }

      logger.debug(
        {
          requestId: request.id,
          title: series.title,
          episodeFileCount,
          totalSeasons,
          availableSeasons,
          hasEpisodeData: !!availableEpisodes,
          monitored: series.monitored,
          isAvailable,
        },
        'Sonarr series status'
      );

      return {
        isAvailable,
        availableSeasons: availableSeasons.length > 0 ? availableSeasons : undefined,
        availableEpisodes,
        totalSeasons: totalSeasons > 0 ? totalSeasons : undefined,
      };
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error checking Sonarr status');
      return { isAvailable: false };
    }
  }

  /**
   * Notify user via WhatsApp that their media is available
   */
  private async notifyUserMediaAvailable(
    request: any,
    availabilityInfo: {
      isAvailable: boolean;
      isPartial?: boolean;
      availableSeasons?: number[];
    }
  ): Promise<void> {
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

      let message: string;

      if (availabilityInfo.isPartial && request.mediaType === 'series') {
        // Partially available TV series
        let availabilityDetails = '';

        if (availabilityInfo.availableSeasons && availabilityInfo.availableSeasons.length > 0) {
          const sortedSeasons = availabilityInfo.availableSeasons.sort((a, b) => a - b);
          const seasonList = sortedSeasons.map((s) => `Season ${s}`).join(', ');
          availabilityDetails = `\n\n✅ *Available:* ${seasonList}`;
        } else {
          availabilityDetails = '\n\n⚠️ Some content is now available.';
        }

        message =
          `🎉 *Good news!*\n\n` +
          `${emoji} *${request.title}${yearStr}* is now partially available in your library!` +
          availabilityDetails +
          `\n\nYou can start watching the available content now. More episodes may be added soon!`;
      } else {
        // Fully available (movies or complete TV series)
        message =
          `🎉 *Good news!*\n\n` +
          `${emoji} *${request.title}${yearStr}* is now available in your library!\n\n` +
          `You can start watching it now.`;
      }

      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.info(
        {
          requestId: request.id,
          title: request.title,
          phoneNumber: phoneNumber.slice(-4),
          isPartial: availabilityInfo.isPartial,
          availableSeasons: availabilityInfo.availableSeasons,
        },
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
