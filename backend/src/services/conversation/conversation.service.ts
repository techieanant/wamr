import { conversationSessionRepository } from '../../repositories/conversation-session.repository.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import { contactRepository } from '../../repositories/contact.repository.js';
import { requestHistoryRepository } from '../../repositories/request-history.repository.js';
import { intentParser, IntentResult } from './intent-parser.js';
import { stateMachine, StateMachineAction } from './state-machine.js';
import {
  ConversationSessionModel,
  ConversationState,
  NormalizedResult,
  generateSessionId,
  getExpirationTime,
} from '../../models/conversation-session.model.js';
import { logger } from '../../config/logger.js';
import { webSocketService, SocketEvents } from '../websocket/websocket.service.js';
import { encryptionService } from '../encryption/encryption.service.js';
import { mediaSearchService } from '../media-search/media-search.service.js';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { requestApprovalService } from './request-approval.service.js';
import { settingRepository } from '../../repositories/setting.repository.js';

/**
 * Conversation service response
 */
export interface ConversationResponse {
  message: string;
  state: ConversationState;
  sessionId: string;
}

/**
 * Conversation Service
 * Orchestrates the conversation flow, state machine, and media search
 */
export class ConversationService {
  // Store reply JIDs for async callbacks (sessionId -> fullJid for sending messages)
  private activeReplyJids = new Map<string, string>();
  // Store actual phone numbers for storage (sessionId -> phone number like +17788796712)
  private activePhoneNumbers = new Map<string, string>();
  // Store active contact names for async callbacks (sessionId -> contactName)
  private activeContactNames = new Map<string, string>();

  // Session expiry: 24 hours so users can reply at their leisure
  private readonly SESSION_EXPIRY_MINUTES = 24 * 60;

  /**
   * Resolve a full poster URL from a NormalizedResult
   */
  private resolvePosterUrl(result: NormalizedResult): string | null {
    if (!result.posterPath) return null;
    if (result.posterPath.startsWith('http')) {
      return result.posterPath;
    }
    // TMDB path from Seerr
    return `https://image.tmdb.org/t/p/w500${result.posterPath}`;
  }

  /**
   * Process an incoming message from a user
   * @param phoneNumberHash - Hash of the phone number/identifier for session lookup
   * @param message - The message text
   * @param replyJid - Full JID to use for sending responses (preserves @lid or @s.whatsapp.net)
   * @param contactName - Contact display name
   * @param phoneNumber - Actual phone number for storage (optional, may not be available with LID)
   */
  async processMessage(
    phoneNumberHash: string,
    message: string,
    replyJid?: string,
    contactName?: string | null,
    phoneNumber?: string
  ): Promise<ConversationResponse> {
    logger.info(
      { phoneNumberHash, message, contactName, hasPhoneNumber: !!phoneNumber },
      'Processing incoming message'
    );

    // Get or create conversation session
    let session = await conversationSessionRepository.findByPhoneHash(phoneNumberHash);

    if (!session) {
      // Create new session in IDLE state
      session = await conversationSessionRepository.create({
        id: generateSessionId(),
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
        contactName: contactName || undefined,
      });
      logger.info(
        { sessionId: session.id, phoneNumberHash, contactName },
        'Created new conversation session'
      );
      // When we create a new session and we already have a contact name (from message metadata),
      // persist contact and backfill historical request entries so older requests show a name.
      if (contactName) {
        try {
          // Persist the contact name and backfill historical request entries so older requests show a name.
          // Phone number may be null for LID users; only encrypt if available.
          const phoneNumberEncrypted = phoneNumber
            ? encryptionService.encrypt(phoneNumber)
            : undefined;
          await contactRepository.upsert({
            phoneNumberHash,
            contactName,
            phoneNumberEncrypted,
            replyJid: replyJid ?? undefined,
          });
          // Backfill contact name to existing request_history entries
          await requestHistoryRepository.updateContactNameForPhone(
            phoneNumberHash,
            contactName,
            true
          );
          // Emit contact update to clients so they can show contact name for matching requests
          webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
            phoneNumberHash,
            contactName,
            timestamp: new Date().toISOString(),
          });
          logger.info({ phoneNumberHash, contactName }, 'Upserted contact and backfilled requests');
        } catch (err) {
          logger.warn(
            { sessionId: session.id, phoneNumberHash, contactName, error: err },
            'Failed to persist contact on new session creation'
          );
        }
      }
    } else if (contactName && session.contactName !== contactName) {
      // Update contact name if it changed
      const updated = await conversationSessionRepository.update(session.id, {
        contactName,
      });
      if (updated) {
        session = updated;

        try {
          // Upsert to contacts list and backfill historical request entries.
          // Phone number may be null for LID users; only encrypt if available.
          const phoneNumberEncrypted = phoneNumber
            ? encryptionService.encrypt(phoneNumber)
            : undefined;
          await contactRepository.upsert({
            phoneNumberHash,
            contactName,
            phoneNumberEncrypted,
            replyJid: replyJid ?? undefined,
          });
          // Backfill contact name to existing request_history entries
          await requestHistoryRepository.updateContactNameForPhone(
            phoneNumberHash,
            contactName,
            true
          );
          // Emit a socket event so admin clients can update their cached request rows immediately
          webSocketService.emit(SocketEvents.REQUEST_CONTACT_UPDATE, {
            phoneNumberHash,
            contactName,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          logger.warn(
            { sessionId: session.id, phoneNumberHash, contactName, error: err },
            'Failed to update contact repository'
          );
        }
      } else {
        logger.warn({ sessionId: session.id }, 'Failed to update contact name for session');
      }
    } else if (phoneNumber) {
      // Existing session, name unchanged, but we have a phone number.
      // Update the contact if it's missing a phone number (e.g. created during regression).
      try {
        const existingContact = await contactRepository.findByPhoneHash(phoneNumberHash);
        if (existingContact && !existingContact.phoneNumberEncrypted) {
          const phoneNumberEncrypted = encryptionService.encrypt(phoneNumber);
          await contactRepository.upsert({
            phoneNumberHash,
            contactName: existingContact.contactName || contactName,
            phoneNumberEncrypted,
            replyJid: replyJid ?? undefined,
          });
          logger.info(
            { phoneNumberHash, contactId: existingContact.id },
            'Updated contact with phone number'
          );
        }
      } catch (err) {
        logger.warn(
          { sessionId: session.id, phoneNumberHash, error: err },
          'Failed to backfill contact phone number'
        );
      }
    }

    // Debug: Log session state
    logger.info(
      {
        sessionId: session.id,
        sessionState: session.state,
        hasResults: !!session.searchResults?.length,
        message,
      },
      '🔍 DEBUG: Session loaded with state'
    );

    // Store replyJid (for sending responses), phone number (for storage), and contact name for async callbacks
    if (replyJid) {
      this.activeReplyJids.set(session.id, replyJid);
    }
    if (phoneNumber) {
      this.activePhoneNumbers.set(session.id, phoneNumber);
    }
    if (contactName) {
      this.activeContactNames.set(session.id, contactName);
    }

    // Parse user intent
    const intent = intentParser.parse(message, session.state);
    logger.info(
      { sessionId: session.id, intent, sessionState: session.state },
      '🔍 DEBUG: Parsed user intent'
    );

    // Handle the intent based on current state
    const response = await this.handleIntent(session, intent);

    return response;
  }

  /**
   * Handle user intent based on current conversation state
   */
  private async handleIntent(
    session: ConversationSessionModel,
    intent: IntentResult
  ): Promise<ConversationResponse> {
    const currentState = session.state;

    logger.info(
      {
        sessionId: session.id,
        currentState,
        intentType: intent.intent,
        selectionNumber: intent.selectionNumber,
      },
      '🔍 DEBUG: Routing to handler based on state'
    );

    // Handle cancellation from any state (except PROCESSING)
    if (intent.intent === 'cancel') {
      logger.info({ sessionId: session.id }, '🔍 DEBUG: Calling handleCancel');
      return this.handleCancel(session);
    }

    // Allow starting a new search from any interactive state
    if (
      intent.intent === 'media_request' &&
      currentState !== 'IDLE' &&
      currentState !== 'PROCESSING'
    ) {
      logger.info(
        { sessionId: session.id, currentState, query: intent.query },
        '🔍 DEBUG: Starting new search from interactive state, resetting session'
      );
      const resetSession = await this.resetSessionForNewSearch(session);
      return this.handleIdleState(resetSession, intent);
    }

    // Handle based on current state
    switch (currentState) {
      case 'IDLE':
        logger.info({ sessionId: session.id }, '🔍 DEBUG: Calling handleIdleState');
        return this.handleIdleState(session, intent);

      case 'SEARCHING':
        // User shouldn't send messages while searching, but if they do, ignore
        logger.info({ sessionId: session.id }, '🔍 DEBUG: In SEARCHING state, asking user to wait');
        return this.createResponse(
          session,
          'Please wait while I search for results...',
          'SEARCHING'
        );

      case 'AWAITING_SELECTION':
        logger.info({ sessionId: session.id }, '🔍 DEBUG: Calling handleAwaitingSelection');
        return this.handleAwaitingSelection(session, intent);

      case 'AWAITING_SEASON_SELECTION':
        logger.info({ sessionId: session.id }, '🔍 DEBUG: Calling handleAwaitingSeasonSelection');
        return this.handleAwaitingSeasonSelection(session, intent);

      case 'AWAITING_CONFIRMATION':
        logger.info({ sessionId: session.id }, '🔍 DEBUG: Calling handleAwaitingConfirmation');
        return this.handleAwaitingConfirmation(session, intent);

      case 'PROCESSING':
        // User shouldn't send messages while processing, but if they do, ignore
        return this.createResponse(
          session,
          'Please wait while I submit your request...',
          'PROCESSING'
        );

      default:
        logger.error({ sessionId: session.id, state: currentState }, 'Unknown conversation state');
        return this.resetToIdle(session, 'An error occurred. Please start over.');
    }
  }

  /**
   * Handle IDLE state - expecting media request
   */
  private async handleIdleState(
    session: ConversationSessionModel,
    intent: IntentResult
  ): Promise<ConversationResponse> {
    if (intent.intent !== 'media_request' || !intent.query || !intent.mediaType) {
      return this.createResponse(
        session,
        'I can help you find movies and TV series! Try saying something like:\n\n' +
          '🎬 "I want to watch Inception"\n' +
          '📺 "Find Breaking Bad series"\n' +
          '🎬 "Search for The Matrix"',
        'IDLE'
      );
    }

    // Start search
    const action: StateMachineAction = {
      type: 'START_SEARCH',
      mediaType: intent.mediaType,
      query: intent.query,
    };

    const transitionResult = stateMachine.processAction(session.state, action);

    if (!transitionResult.valid) {
      logger.error(
        { sessionId: session.id, error: transitionResult.error },
        'Invalid state transition for START_SEARCH'
      );
      return this.createResponse(session, 'An error occurred. Please try again.', 'IDLE');
    }

    // Update session to SEARCHING state
    await conversationSessionRepository.update(session.id, {
      state: 'SEARCHING',
      mediaType: intent.mediaType,
      searchQuery: intent.query,
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    // Trigger media search asynchronously — but first send the "searching" ack
    // directly here so it's guaranteed to be dispatched before search results arrive.
    // (The caller also returns this message and sends it, but race conditions between
    // fast cached searches and WhatsApp message delivery mean results can arrive first.)
    const replyJid = this.activeReplyJids.get(session.id);
    if (replyJid) {
      try {
        const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
        await whatsappClientService.sendMessage(
          replyJid,
          `🔍 Searching for: "${intent.query}"...\n\nPlease wait...`
        );
      } catch (sendErr) {
        logger.warn({ sessionId: session.id, error: sendErr }, 'Failed to send search ack');
      }
    }

    // Perform search in background — results sent directly to user from performSearch()
    this.performSearch(session.id, intent.mediaType, intent.query).catch((error) => {
      logger.error({ sessionId: session.id, error }, 'Media search failed');
    });

    // Return empty message — the ack was already sent above, don't double-send
    return this.createResponse(session, '', 'SEARCHING');
  }

  /**
   * Perform media search and handle results
   */
  private async performSearch(
    sessionId: string,
    mediaType: 'movie' | 'series' | 'both',
    query: string
  ): Promise<void> {
    try {
      logger.debug({ sessionId, mediaType, query }, 'Executing media search');

      // Search for media - always search both types for better UX
      // This way "breaking bad" will find the TV series even if mediaType defaults to 'movie'
      const searchResult = await mediaSearchService.search(mediaType, query, true);

      logger.info(
        {
          sessionId,
          resultCount: searchResult.results.length,
          fromCache: searchResult.fromCache,
          duration: searchResult.searchDuration,
        },
        'Media search completed'
      );

      // Handle search completion
      const response = await this.handleSearchComplete(sessionId, searchResult.results);

      if (!response) {
        // null means the session was no longer in SEARCHING state — most likely the user
        // cancelled mid-search. Silently discard; no error message needed.
        logger.info(
          { sessionId, query },
          'handleSearchComplete returned null — session was cancelled or state changed, discarding results'
        );
        return;
      }

      // Get reply JID for this session (for sending messages)
      const replyJid = this.activeReplyJids.get(sessionId);

      if (replyJid) {
        // Import whatsappClientService dynamically to avoid circular dependency
        const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');

        // Send search results to user
        await whatsappClientService.sendMessage(replyJid, response.message);

        logger.info({ sessionId, replyJid: replyJid.slice(-4) }, 'Search results sent to user');
      } else {
        logger.error(
          { sessionId, query },
          'Reply JID not found for session — search results cannot be sent to user'
        );
      }
    } catch (error) {
      logger.error({ sessionId, error }, 'Error performing media search');

      // Get reply JID for error notification
      const replyJid = this.activeReplyJids.get(sessionId);

      // Update session to IDLE and mark as failed
      this.cleanupSessionMaps(sessionId);
      await conversationSessionRepository.update(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });

      // Notify user of search failure
      if (replyJid) {
        try {
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
          await whatsappClientService.sendMessage(
            replyJid,
            '❌ Search failed. Please try again later.'
          );
        } catch (sendError) {
          logger.error({ sessionId, error: sendError }, 'Failed to send error message');
        }
      } else {
        logger.warn(
          { sessionId },
          'Phone number not found for session - cannot send error message'
        );
      }
    }
  }

  /**
   * Handle AWAITING_SELECTION state - expecting numeric selection
   */
  private async handleAwaitingSelection(
    session: ConversationSessionModel,
    intent: IntentResult
  ): Promise<ConversationResponse> {
    const results = session.searchResults || [];

    if (intent.intent !== 'selection' || intent.selectionNumber === undefined) {
      return this.createResponse(
        session,
        `Please select a number from the list (1-${results.length}), or reply CANCEL to start over.`,
        'AWAITING_SELECTION'
      );
    }

    const { selectionNumber } = intent;

    // Validate selection number
    if (selectionNumber < 1 || selectionNumber > results.length) {
      return this.createResponse(
        session,
        `Please choose a number between 1 and ${results.length}.`,
        'AWAITING_SELECTION'
      );
    }

    // Get selected result (convert to 0-indexed)
    const selectedResult = results[selectionNumber - 1];

    // Block requests for media that Overseerr already knows about (status >= 2).
    // 2=pending, 3=processing, 4=partially_available, 5=available
    if (selectedResult.mediaStatus !== undefined && selectedResult.mediaStatus >= 2) {
      const emoji = selectedResult.mediaType === 'movie' ? '🎬' : '📺';
      const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
      const statusMessages: Record<number, string> = {
        2: `⏳ *${selectedResult.title}${yearStr}* has already been requested and is pending approval.`,
        3: `⚙️ *${selectedResult.title}${yearStr}* is already being processed/downloaded.`,
        4: `✅ *${selectedResult.title}${yearStr}* is partially available — some content can already be watched!`,
        5: `✅ *${selectedResult.title}${yearStr}* is already available in the library. You can watch it now!`,
      };
      const msg =
        statusMessages[selectedResult.mediaStatus] ??
        `ℹ️ ${emoji} *${selectedResult.title}${yearStr}* is already in the system.`;
      return this.createResponse(session, msg, 'AWAITING_SELECTION');
    }

    // Check if this is a TV series - if so, fetch season details and ask for season selection
    if (selectedResult.mediaType === 'series' && selectedResult.tmdbId) {
      try {
        // Get Seerr service configuration
        const overseerrConfigs = await mediaServiceConfigRepository.findByType('seerr');
        const overseerrConfig = overseerrConfigs.find((c) => c.enabled);

        if (overseerrConfig && overseerrConfig.apiKeyEncrypted) {
          // Fetch TV details including season information from Seerr
          const { OverseerrClient } = await import('../integrations/overseerr.client.js');
          const { encryptionService } = await import('../encryption/encryption.service.js');

          const apiKey = encryptionService.decrypt(overseerrConfig.apiKeyEncrypted);
          const client = new OverseerrClient(overseerrConfig.baseUrl, apiKey);
          const tvDetails = await client.getTvDetails(selectedResult.tmdbId);

          logger.debug(
            {
              sessionId: session.id,
              tmdbId: selectedResult.tmdbId,
              hasTvDetails: !!tvDetails,
              hasMediaInfo: !!tvDetails?.mediaInfo,
              hasSeasons: !!tvDetails?.seasons,
              seasonsLength: tvDetails?.seasons?.length,
              hasMediaInfoSeasons: !!tvDetails?.mediaInfo?.seasons,
              mediaInfoSeasonsLength: tvDetails?.mediaInfo?.seasons?.length,
            },
            'TV details fetched - checking season data'
          );

          // Use top-level seasons array (has episode counts and details)
          // and optionally merge with mediaInfo.seasons for availability status
          if (tvDetails && tvDetails.seasons && tvDetails.seasons.length > 0) {
            // Filter out season 0 (specials) and get only regular seasons
            const regularSeasons: import('../../models/conversation-session.model.js').SeasonInfo[] =
              tvDetails.seasons
                .filter((s: any) => s.seasonNumber > 0)
                .map((s: any) => ({
                  seasonNumber: s.seasonNumber,
                  name: s.name || `Season ${s.seasonNumber}`,
                  episodeCount: s.episodeCount || 0,
                  airDate: s.airDate,
                  overview: s.overview,
                }));

            if (regularSeasons.length > 0) {
              // Transition to AWAITING_SEASON_SELECTION
              const action: StateMachineAction = {
                type: 'SELECT_RESULT',
                index: selectionNumber - 1,
                result: selectedResult,
              };

              const transitionResult = stateMachine.processAction(session.state, action);

              if (!transitionResult.valid) {
                logger.error(
                  { sessionId: session.id, error: transitionResult.error },
                  'Invalid state transition for SELECT_RESULT (TV series)'
                );
                return this.createResponse(
                  session,
                  'An error occurred. Please try again.',
                  'AWAITING_SELECTION'
                );
              }

              // Update session with season information
              await conversationSessionRepository.update(session.id, {
                state: 'AWAITING_SEASON_SELECTION',
                selectedResultIndex: selectionNumber - 1,
                selectedResult,
                availableSeasons: regularSeasons,
                expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
              });

              // Generate season selection message
              const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
              let seasonMessage =
                `📺 *${selectedResult.title}${yearStr}*\n\n` + `Available seasons:\n\n`;

              regularSeasons.forEach((season) => {
                seasonMessage += `Season ${season.seasonNumber}: ${season.name} (${season.episodeCount} episodes)\n`;
              });

              seasonMessage +=
                `\n` +
                `Which season(s) would you like to download?\n\n` +
                `Reply with:\n` +
                `• Season numbers (e.g., "1", "1,2,3")\n` +
                `• "all" for all seasons\n` +
                `• "cancel" to start over`;

              return this.createResponse(session, seasonMessage, 'AWAITING_SEASON_SELECTION');
            }
          }
        }

        logger.warn(
          { sessionId: session.id, tmdbId: selectedResult.tmdbId },
          'No season information available for TV series, proceeding with confirmation'
        );
      } catch (error) {
        logger.error(
          { sessionId: session.id, error, tmdbId: selectedResult.tmdbId },
          'Failed to fetch TV season details, proceeding with confirmation'
        );
      }
    }

    // For movies or if season fetch failed, proceed to confirmation
    // Transition to AWAITING_CONFIRMATION
    const action: StateMachineAction = {
      type: 'SELECT_RESULT',
      index: selectionNumber - 1,
      result: selectedResult,
    };

    const transitionResult = stateMachine.processAction(session.state, action);

    if (!transitionResult.valid) {
      logger.error(
        { sessionId: session.id, error: transitionResult.error },
        'Invalid state transition for SELECT_RESULT'
      );
      return this.createResponse(
        session,
        'An error occurred. Please try again.',
        'AWAITING_SELECTION'
      );
    }

    // Update session
    await conversationSessionRepository.update(session.id, {
      state: 'AWAITING_CONFIRMATION',
      selectedResultIndex: selectionNumber - 1,
      selectedResult,
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    // Generate confirmation message
    const emoji = selectedResult.mediaType === 'movie' ? '🎬' : '📺';
    const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';
    const seasonInfo = selectedResult.seasonCount
      ? `\n📺 Seasons: ${selectedResult.seasonCount}`
      : '';

    const confirmationMessage =
      `${emoji} You selected:\n\n` +
      `*${selectedResult.title}${yearStr}*${seasonInfo}\n\n` +
      `${selectedResult.overview || 'No description available.'}\n\n` +
      `Reply *YES* to confirm or *NO* to cancel.`;

    // Send poster image if enabled and available
    const replyJid = this.activeReplyJids.get(session.id);
    if (replyJid) {
      try {
        const sendPostersSetting = await settingRepository.findByKey('sendPosters');
        const sendPosters = sendPostersSetting?.value !== false; // default true

        if (sendPosters) {
          const posterUrl = this.resolvePosterUrl(selectedResult);
          if (posterUrl) {
            const response = await fetch(posterUrl, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              const imageBuffer = Buffer.from(await response.arrayBuffer());

              const { whatsappClientService } = await import(
                '../whatsapp/whatsapp-client.service.js'
              );

              const viewOnceSetting = await settingRepository.findByKey('sendPostersViewOnce');
              const viewOnce = viewOnceSetting?.value === true;

              await whatsappClientService.sendImage(
                replyJid,
                imageBuffer,
                confirmationMessage,
                viewOnce
              );

              // Return empty message to prevent duplicate text send
              return this.createResponse(session, '', 'AWAITING_CONFIRMATION');
            }
          }
        }
      } catch (error) {
        logger.warn(
          { sessionId: session.id, error, posterUrl: this.resolvePosterUrl(selectedResult) },
          'Failed to send poster image, falling back to text'
        );
      }
    }

    return this.createResponse(session, confirmationMessage, 'AWAITING_CONFIRMATION');
  }

  /**
   * Handle AWAITING_SEASON_SELECTION state - expecting season numbers or "all"
   */
  private async handleAwaitingSeasonSelection(
    session: ConversationSessionModel,
    intent: IntentResult
  ): Promise<ConversationResponse> {
    if (intent.intent !== 'season_selection' || !intent.seasons) {
      return this.createResponse(
        session,
        'Please select seasons by entering:\n\n' +
          '• Numbers separated by commas (e.g., "1,2,3")\n' +
          '• A single season number (e.g., "1")\n' +
          '• "all" for all available seasons\n\n' +
          'Or reply *CANCEL* to go back.',
        'AWAITING_SEASON_SELECTION'
      );
    }

    // Validate selected seasons against available seasons
    const availableSeasons = session.availableSeasons || [];

    if (intent.seasons !== 'all') {
      const invalidSeasons = intent.seasons.filter(
        (seasonNum) => !availableSeasons.some((s) => s.seasonNumber === seasonNum)
      );

      if (invalidSeasons.length > 0) {
        return this.createResponse(
          session,
          `⚠️ Invalid season(s): ${invalidSeasons.join(', ')}\n\n` +
            `Available seasons: ${availableSeasons.map((s) => s.seasonNumber).join(', ')}\n\n` +
            'Please try again or reply *CANCEL* to go back.',
          'AWAITING_SEASON_SELECTION'
        );
      }
    }

    // Transition to AWAITING_CONFIRMATION
    const action: StateMachineAction = {
      type: 'SELECT_SEASONS',
      seasons: intent.seasons,
    };

    const transitionResult = stateMachine.processAction(session.state, action);

    if (!transitionResult.valid) {
      logger.error(
        { sessionId: session.id, error: transitionResult.error },
        'Invalid state transition for SELECT_SEASONS'
      );
      return this.createResponse(
        session,
        'An error occurred. Please try again.',
        'AWAITING_SEASON_SELECTION'
      );
    }

    // Update session with selected seasons
    await conversationSessionRepository.update(session.id, {
      state: 'AWAITING_CONFIRMATION',
      selectedSeasons:
        intent.seasons === 'all' ? availableSeasons.map((s) => s.seasonNumber) : intent.seasons,
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    // Generate confirmation message
    const selectedResult = session.selectedResult;
    if (!selectedResult) {
      logger.error({ sessionId: session.id }, 'No selected result found in session');
      return this.resetToIdle(session, 'An error occurred. Please start over.');
    }

    const emoji = '📺';
    const yearStr = selectedResult.year ? ` (${selectedResult.year})` : '';

    // Build season summary
    let seasonSummary: string;
    if (intent.seasons === 'all') {
      seasonSummary = `All ${availableSeasons.length} seasons`;
    } else {
      seasonSummary =
        intent.seasons.length === 1
          ? `Season ${intent.seasons[0]}`
          : `Seasons ${intent.seasons.join(', ')}`;
    }

    const confirmationMessage =
      `${emoji} You selected:\n\n` +
      `*${selectedResult.title}${yearStr}*\n` +
      `📺 ${seasonSummary}\n\n` +
      `${selectedResult.overview || 'No description available.'}\n\n` +
      `Reply *YES* to confirm or *NO* to cancel.`;

    // Send poster image if enabled and available
    const replyJid = this.activeReplyJids.get(session.id);
    if (replyJid) {
      try {
        const sendPostersSetting = await settingRepository.findByKey('sendPosters');
        const sendPosters = sendPostersSetting?.value !== false; // default true

        if (sendPosters) {
          const posterUrl = this.resolvePosterUrl(selectedResult);
          if (posterUrl) {
            const response = await fetch(posterUrl, { signal: AbortSignal.timeout(5000) });
            if (response.ok) {
              const imageBuffer = Buffer.from(await response.arrayBuffer());

              const { whatsappClientService } = await import(
                '../whatsapp/whatsapp-client.service.js'
              );

              const viewOnceSetting = await settingRepository.findByKey('sendPostersViewOnce');
              const viewOnce = viewOnceSetting?.value === true;

              await whatsappClientService.sendImage(
                replyJid,
                imageBuffer,
                confirmationMessage,
                viewOnce
              );

              // Return empty message to prevent duplicate text send
              return this.createResponse(session, '', 'AWAITING_CONFIRMATION');
            }
          }
        }
      } catch (error) {
        logger.warn(
          { sessionId: session.id, error, posterUrl: this.resolvePosterUrl(selectedResult) },
          'Failed to send poster image, falling back to text'
        );
      }
    }

    return this.createResponse(session, confirmationMessage, 'AWAITING_CONFIRMATION');
  }

  /**
   * Handle AWAITING_CONFIRMATION state - expecting YES/NO
   */
  private async handleAwaitingConfirmation(
    session: ConversationSessionModel,
    intent: IntentResult
  ): Promise<ConversationResponse> {
    if (intent.intent !== 'confirmation') {
      return this.createResponse(
        session,
        'Please reply *YES* to confirm your selection or *NO* to cancel.',
        'AWAITING_CONFIRMATION'
      );
    }

    if (!intent.confirmed) {
      // User said NO
      return this.handleCancel(session);
    }

    // Pre-check quota before transitioning to PROCESSING — avoids sending ⏳ then a
    // rejection 8ms later (two rapid sends to the same @lid JID causes the second to drop).
    const { quotaCheckService, formatQuotaWindow } = await import('./quota-check.service.js');
    const quotaCheck = await quotaCheckService.checkQuota(session.phoneNumberHash);
    if (!quotaCheck.allowed) {
      const msg =
        quotaCheck.max === 0
          ? `❌ Requests are not allowed for your account.\n\nPlease contact the administrator.`
          : `❌ Request limit reached\n\n` +
            `You've used ${quotaCheck.used}/${quotaCheck.max} requests ${formatQuotaWindow(quotaCheck.windowType)}.\n` +
            `Your quota resets ${quotaCheck.resetTime}.\n\n` +
            `Try again then!`;
      return this.createResponse(session, msg, 'AWAITING_CONFIRMATION');
    }

    // User confirmed - transition to PROCESSING
    const action: StateMachineAction = { type: 'CONFIRM' };
    const transitionResult = stateMachine.processAction(session.state, action);

    if (!transitionResult.valid) {
      logger.error(
        { sessionId: session.id, error: transitionResult.error },
        'Invalid state transition for CONFIRM'
      );
      return this.createResponse(
        session,
        'An error occurred. Please try again.',
        'AWAITING_CONFIRMATION'
      );
    }

    // Update session to PROCESSING
    await conversationSessionRepository.update(session.id, {
      state: 'PROCESSING',
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    // Get auto-approval mode to determine the response message
    const connection = await whatsappConnectionRepository.getActive();
    const autoApprovalMode = connection?.autoApprovalMode || 'auto_approve';

    // Submit request asynchronously
    logger.info({ sessionId: session.id, autoApprovalMode }, 'Started request processing');

    // Trigger async submission
    this.submitRequest(session.id, session.phoneNumberHash).catch((error) => {
      logger.error({ sessionId: session.id, error }, 'Failed to submit request');
    });

    // Send a generic processing message. The actual result (submitted/pending/rejected)
    // will be communicated by the request approval service asynchronously.
    return this.createResponse(
      session,
      '⏳ Processing your request...\n\nPlease wait...',
      'PROCESSING'
    );
  }

  /**
   * Handle cancellation
   */
  private async handleCancel(session: ConversationSessionModel): Promise<ConversationResponse> {
    if (session.state === 'PROCESSING') {
      return this.createResponse(
        session,
        'Cannot cancel while processing. Please wait for the current request to complete.',
        'PROCESSING'
      );
    }

    // Reset to IDLE
    this.cleanupSessionMaps(session.id);
    await conversationSessionRepository.update(session.id, {
      state: 'IDLE',
      mediaType: null,
      searchQuery: null,
      searchResults: null,
      selectedResultIndex: null,
      selectedResult: null,
    });

    return this.createResponse(
      session,
      '❌ Request cancelled. Send a new message to start over.',
      'IDLE'
    );
  }

  /**
   * Reset session to IDLE with a custom message
   */
  private async resetToIdle(
    session: ConversationSessionModel,
    message: string
  ): Promise<ConversationResponse> {
    this.cleanupSessionMaps(session.id);
    await conversationSessionRepository.update(session.id, {
      state: 'IDLE',
      mediaType: null,
      searchQuery: null,
      searchResults: null,
      selectedResultIndex: null,
      selectedResult: null,
    });

    return this.createResponse(session, message, 'IDLE');
  }

  /**
   * Create a response object
   */
  private createResponse(
    session: ConversationSessionModel,
    message: string,
    state: ConversationState
  ): ConversationResponse {
    return {
      message,
      state,
      sessionId: session.id,
    };
  }

  /**
   * Clean up in-memory Maps for a session to prevent memory leaks
   */
  private cleanupSessionMaps(sessionId: string): void {
    this.activeReplyJids.delete(sessionId);
    this.activePhoneNumbers.delete(sessionId);
    this.activeContactNames.delete(sessionId);
  }

  /**
   * Reset an interactive session so the user can start a fresh search.
   * Clears all selection/confirmation state from DB and memory.
   * Preserves activeReplyJids (and activePhoneNumbers/activeContactNames) because
   * the new search that follows will need them to deliver results.
   */
  private async resetSessionForNewSearch(
    session: ConversationSessionModel
  ): Promise<ConversationSessionModel> {
    // Do NOT call cleanupSessionMaps() here — the subsequent search
    // needs activeReplyJids/activePhoneNumbers/activeContactNames
    // to deliver results to the user. Only clear the DB state.

    const updated = await conversationSessionRepository.update(session.id, {
      state: 'IDLE',
      mediaType: null,
      searchQuery: null,
      searchResults: null,
      selectedResultIndex: null,
      selectedResult: null,
      availableSeasons: null,
      selectedSeasons: null,
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    logger.info({ sessionId: session.id }, 'Reset session for new search');
    return updated || session;
  }

  /**
   * Handle search completion (called by media-search.service.ts)
   */
  async handleSearchComplete(
    sessionId: string,
    results: NormalizedResult[]
  ): Promise<ConversationResponse | null> {
    const session = await conversationSessionRepository.findById(sessionId);

    if (!session) {
      logger.warn({ sessionId }, 'Session not found for search completion');
      return null;
    }

    if (session.state !== 'SEARCHING') {
      logger.warn(
        { sessionId, state: session.state },
        'Session not in SEARCHING state for completion'
      );
      return null;
    }

    // If no results, return to IDLE
    if (results.length === 0) {
      const action: StateMachineAction = { type: 'SEARCH_FAILED' };
      stateMachine.processAction(session.state, action);

      await conversationSessionRepository.update(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });

      return this.createResponse(
        session,
        `❌ No matches found for "${session.searchQuery}".\n\nTry a different title or check spelling.`,
        'IDLE'
      );
    }

    // Results found - transition to AWAITING_SELECTION
    const action: StateMachineAction = { type: 'SEARCH_COMPLETED', results };
    const transitionResult = stateMachine.processAction(session.state, action);

    if (!transitionResult.valid) {
      logger.error(
        { sessionId, error: transitionResult.error },
        'Invalid state transition for SEARCH_COMPLETED'
      );
      return null;
    }

    // Update session
    await conversationSessionRepository.update(sessionId, {
      state: 'AWAITING_SELECTION',
      searchResults: results,
      expiresAt: getExpirationTime(this.SESSION_EXPIRY_MINUTES),
    });

    // Format results for display
    const resultsList = results
      .map((result, index) => {
        // Use each result's actual media type for the correct emoji
        const emoji = result.mediaType === 'movie' ? '🎬' : '📺';
        const yearStr = result.year ? ` (${result.year})` : '';
        const seasonInfo = result.seasonCount
          ? ` - ${result.seasonCount} season${result.seasonCount > 1 ? 's' : ''}`
          : '';
        // Show full overview as a paragraph (limit to 300 chars for reasonable message length)
        const overview = result.overview?.substring(0, 300) || 'No description available';
        const ellipsis = result.overview && result.overview.length > 300 ? '...' : '';
        return `${index + 1}. ${emoji} ${result.title}${yearStr}${seasonInfo}\n   ${overview}${ellipsis}`;
      })
      .join('\n\n');

    const message =
      `Found ${results.length} result${results.length > 1 ? 's' : ''}:\n\n` +
      resultsList +
      `\n\nReply with a number (1-${results.length}) to select, or CANCEL to start over.`;

    return this.createResponse(session, message, 'AWAITING_SELECTION');
  }

  /**
   * Handle request submission completion (called by request submission logic)
   */
  async handleSubmissionComplete(
    sessionId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<ConversationResponse | null> {
    const session = await conversationSessionRepository.findById(sessionId);

    if (!session) {
      logger.warn({ sessionId }, 'Session not found for submission completion');
      return null;
    }

    if (session.state !== 'PROCESSING') {
      logger.warn(
        { sessionId, state: session.state },
        'Session not in PROCESSING state for completion'
      );
      return null;
    }

    // Transition back to IDLE
    const action: StateMachineAction = success
      ? { type: 'PROCESSING_COMPLETED' }
      : { type: 'PROCESSING_FAILED' };

    stateMachine.processAction(session.state, action);

    this.cleanupSessionMaps(sessionId);
    await conversationSessionRepository.update(sessionId, {
      state: 'IDLE',
    });

    if (success && session.selectedResult) {
      const emoji = session.selectedResult.mediaType === 'movie' ? '🎬' : '📺';
      const yearStr = session.selectedResult.year ? ` (${session.selectedResult.year})` : '';
      const message =
        `✅ Request submitted successfully!\n\n` +
        `${emoji} *${session.selectedResult.title}${yearStr}* has been added to the queue.\n\n` +
        `You will be notified when it's available.`;

      return this.createResponse(session, message, 'IDLE');
    } else {
      const message =
        '❌ Failed to submit your request.\n\n' +
        (errorMessage || 'An error occurred. Please try again later.');

      return this.createResponse(session, message, 'IDLE');
    }
  }

  /**
   * Submit media request using approval service
   */
  private async submitRequest(sessionId: string, phoneNumberHash: string): Promise<void> {
    try {
      const session = await conversationSessionRepository.findById(sessionId);

      if (!session || !session.selectedResult) {
        logger.error({ sessionId }, 'Session or selected result not found for submission');
        const errResponse = await this.handleSubmissionComplete(
          sessionId,
          false,
          'Session not found'
        );
        const replyJid = this.activeReplyJids.get(sessionId);
        if (errResponse?.message && replyJid) {
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
          await whatsappClientService.sendMessage(replyJid, errResponse.message).catch(() => {});
        }
        return;
      }

      const { selectedResult } = session;

      // Get all enabled services, sorted by priority
      const allServices = await mediaServiceConfigRepository.findAll();
      const enabledServices = allServices
        .filter((s) => s.enabled)
        .sort((a, b) => a.priorityOrder - b.priorityOrder);

      if (enabledServices.length === 0) {
        logger.error({ sessionId }, 'No enabled services found');
        const errResponse = await this.handleSubmissionComplete(
          sessionId,
          false,
          'No services configured'
        );
        const replyJid = this.activeReplyJids.get(sessionId);
        if (errResponse?.message && replyJid) {
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
          await whatsappClientService.sendMessage(replyJid, errResponse.message).catch(() => {});
        }
        return;
      }

      // Select the most appropriate service for the media type.
      // Prefer a type-specific service (radarr for movies, sonarr for series),
      // then fall back to seerr, then the highest-priority service.
      const mediaType = selectedResult.mediaType;
      const preferredServiceType = mediaType === 'movie' ? 'radarr' : 'sonarr';

      let service =
        enabledServices.find((s) => s.serviceType === preferredServiceType) ??
        enabledServices.find((s) => s.serviceType === 'seerr') ??
        enabledServices[0];

      logger.info(
        { sessionId, mediaType, selectedServiceType: service.serviceType, serviceId: service.id },
        'Selected service for media request'
      );

      // Get phone number and contact name for this session
      const phoneNumber = this.activePhoneNumbers.get(sessionId);
      const contactName = this.activeContactNames.get(sessionId);

      // Use the request approval service to handle the request
      const result = await requestApprovalService.createAndProcessRequest(
        phoneNumberHash,
        phoneNumber,
        selectedResult,
        service.id,
        session.selectedSeasons ?? undefined,
        contactName,
        this.activeReplyJids.get(sessionId)
      );

      logger.info(
        {
          sessionId,
          status: result.status,
          phoneNumber: phoneNumber ? phoneNumber.slice(-4) : 'unknown',
          replyJid: this.activeReplyJids.get(sessionId)?.slice(-8),
        },
        'Request processing completed'
      );

      const isSuccess = result.status === 'SUBMITTED' || result.status === 'PENDING';

      // Capture replyJid BEFORE handleSubmissionComplete clears session maps
      const replyJid = this.activeReplyJids.get(sessionId);

      // Handle completion - transition back to IDLE
      const response = await this.handleSubmissionComplete(
        sessionId,
        isSuccess,
        result.errorMessage
      );

      // Send confirmation message to the user.
      // For quota rejections, createAndProcessRequest already sent the detailed message,
      // so only send for successful submissions (PENDING/SUBMITTED).
      // For REJECTED status, skip to avoid duplicating the quota rejection message.
      if (isSuccess && response?.message && replyJid) {
        try {
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
          await whatsappClientService.sendMessage(replyJid, response.message);
        } catch (sendError) {
          logger.error({ sessionId, error: sendError }, 'Failed to send success message');
        }
      }
    } catch (error) {
      logger.error({ sessionId, error }, 'Fatal error in submitRequest');

      const response = await this.handleSubmissionComplete(
        sessionId,
        false,
        'An unexpected error occurred'
      );

      if (response) {
        const replyJid = this.activeReplyJids.get(sessionId);
        if (replyJid) {
          try {
            const { whatsappClientService } = await import(
              '../whatsapp/whatsapp-client.service.js'
            );
            await whatsappClientService.sendMessage(replyJid, response.message);
          } catch (sendError) {
            logger.error({ sessionId, error: sendError }, 'Failed to send error message');
          }
        }
      }
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();
