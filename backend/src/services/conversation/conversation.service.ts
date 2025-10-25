import { conversationSessionRepository } from '../../repositories/conversation-session.repository.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
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
import { mediaSearchService } from '../media-search/media-search.service.js';
import { mediaServiceConfigRepository } from '../../repositories/media-service-config.repository.js';
import { requestApprovalService } from './request-approval.service.js';

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
  // Store active phone numbers for async callbacks (sessionId -> phoneNumber)
  private activePhoneNumbers = new Map<string, string>();

  /**
   * Process an incoming message from a user
   */
  async processMessage(
    phoneNumberHash: string,
    message: string,
    phoneNumber?: string
  ): Promise<ConversationResponse> {
    logger.info({ phoneNumberHash, message }, 'Processing incoming message');

    // Get or create conversation session
    let session = await conversationSessionRepository.findByPhoneHash(phoneNumberHash);

    if (!session) {
      // Create new session in IDLE state
      session = await conversationSessionRepository.create({
        id: generateSessionId(),
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: getExpirationTime(5),
      });
      logger.info({ sessionId: session.id, phoneNumberHash }, 'Created new conversation session');
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

    // Store phone number for async callbacks
    if (phoneNumber) {
      this.activePhoneNumbers.set(session.id, phoneNumber);
    }

    // Parse user intent
    const intent = intentParser.parse(message);
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
    });

    // Trigger media search asynchronously
    logger.info(
      { sessionId: session.id, mediaType: intent.mediaType, query: intent.query },
      'Started media search'
    );

    // Perform search in background and handle completion
    this.performSearch(session.id, intent.mediaType, intent.query).catch((error) => {
      logger.error({ sessionId: session.id, error }, 'Media search failed');
    });

    return this.createResponse(
      session,
      `🔍 Searching for ${intent.mediaType === 'movie' ? 'movie' : 'series'}: "${intent.query}"...\n\nPlease wait...`,
      'SEARCHING'
    );
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

      if (response) {
        // Get phone number for this session
        const phoneNumber = this.activePhoneNumbers.get(sessionId);

        if (phoneNumber) {
          // Import whatsappClientService dynamically to avoid circular dependency
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');

          // Send search results to user
          await whatsappClientService.sendMessage(phoneNumber, response.message);

          logger.info(
            { sessionId, phoneNumber: phoneNumber.slice(-4) },
            'Search results sent to user'
          );
        } else {
          logger.warn({ sessionId }, 'Phone number not found for session - cannot send results');
        }
      }
    } catch (error) {
      logger.error({ sessionId, error }, 'Error performing media search');

      // Get phone number for error notification
      const phoneNumber = this.activePhoneNumbers.get(sessionId);

      // Update session to IDLE and mark as failed
      await conversationSessionRepository.update(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });

      // Notify user of search failure
      if (phoneNumber) {
        try {
          const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
          await whatsappClientService.sendMessage(
            phoneNumber,
            '❌ Search failed. Please try again later.'
          );
        } catch (sendError) {
          logger.error({ sessionId, error: sendError }, 'Failed to send error message');
        }
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

    // For auto-deny mode, don't send "Submitting" message - the rejection message will come from request approval service
    // For auto-approve and manual modes, send the "Submitting" message
    if (autoApprovalMode === 'auto_deny') {
      return this.createResponse(session, '⏳ Processing your request...', 'PROCESSING');
    }

    return this.createResponse(
      session,
      '⏳ Submitting your request...\n\nPlease wait while I add this to your library.',
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
        await this.handleSubmissionComplete(sessionId, false, 'Session not found');
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
        await this.handleSubmissionComplete(sessionId, false, 'No services configured');
        return;
      }

      // Use highest priority service
      const service = enabledServices[0];

      // Get phone number for this session
      const phoneNumber = this.activePhoneNumbers.get(sessionId);

      // Use the request approval service to handle the request
      const result = await requestApprovalService.createAndProcessRequest(
        phoneNumberHash,
        phoneNumber,
        selectedResult,
        service.id
      );

      // Note: The request approval service already sends WhatsApp notifications to the user,
      // so we don't need to send duplicate messages here. Only send a message if the
      // request approval service didn't send one (which shouldn't happen in normal flow).

      logger.info(
        {
          sessionId,
          status: result.status,
          phoneNumber: phoneNumber ? phoneNumber.slice(-4) : 'unknown',
        },
        'Request processing completed'
      );

      // Handle completion - transition back to IDLE
      await this.handleSubmissionComplete(
        sessionId,
        result.status === 'SUBMITTED' || result.status === 'PENDING',
        result.errorMessage
      );
    } catch (error) {
      logger.error({ sessionId, error }, 'Fatal error in submitRequest');

      const response = await this.handleSubmissionComplete(
        sessionId,
        false,
        'An unexpected error occurred'
      );

      if (response) {
        const phoneNumber = this.activePhoneNumbers.get(sessionId);
        if (phoneNumber) {
          try {
            const { whatsappClientService } = await import(
              '../whatsapp/whatsapp-client.service.js'
            );
            await whatsappClientService.sendMessage(phoneNumber, response.message);
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
