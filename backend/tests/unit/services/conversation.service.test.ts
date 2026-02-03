import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConversationService,
  conversationService,
} from '../../../src/services/conversation/conversation.service';
import { conversationSessionRepository } from '../../../src/repositories/conversation-session.repository';
import { whatsappConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository';
import { mediaServiceConfigRepository } from '../../../src/repositories/media-service-config.repository';
import { intentParser } from '../../../src/services/conversation/intent-parser';
import { stateMachine } from '../../../src/services/conversation/state-machine';
import { mediaSearchService } from '../../../src/services/media-search/media-search.service';
import { requestApprovalService } from '../../../src/services/conversation/request-approval.service';
import { whatsappClientService } from '../../../src/services/whatsapp/whatsapp-client.service';
import { logger } from '../../../src/config/logger';

// Mock all dependencies
vi.mock('../../../src/repositories/conversation-session.repository');
vi.mock('../../../src/repositories/whatsapp-connection.repository');
vi.mock('../../../src/repositories/media-service-config.repository');
vi.mock('../../../src/services/conversation/intent-parser');
vi.mock('../../../src/services/conversation/state-machine');
vi.mock('../../../src/services/media-search/media-search.service');
vi.mock('../../../src/services/conversation/request-approval.service');
vi.mock('../../../src/services/whatsapp/whatsapp-client.service');
vi.mock('../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConversationService();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('processMessage', () => {
    it('should create new session for unknown phone number', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'hello';

      // Mock repository to return null (no existing session)
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      });
      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(null);
      (conversationSessionRepository.create as any).mockImplementation(mockCreate);

      // Mock intent parser
      (intentParser.parse as any).mockReturnValue({
        intent: 'unknown',
        query: null,
        mediaType: null,
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(conversationSessionRepository.findByPhoneHash).toHaveBeenCalledWith(phoneNumberHash);
      expect(mockCreate).toHaveBeenCalledWith({
        id: expect.any(String),
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: expect.any(String), // getExpirationTime returns ISO string
      });
      expect(result).toEqual({
        message: expect.stringContaining('I can help you find movies'),
        state: 'IDLE',
        sessionId: 'session123',
      });
    });

    it('should use existing session', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'hello';
      const existingSession = {
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(existingSession);
      (intentParser.parse as any).mockReturnValue({
        intent: 'unknown',
        query: null,
        mediaType: null,
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(conversationSessionRepository.findByPhoneHash).toHaveBeenCalledWith(phoneNumberHash);
      expect(conversationSessionRepository.create).not.toHaveBeenCalled();
      expect(result.sessionId).toBe('session123');
    });

    it('should handle media request in IDLE state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'I want to watch Inception';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (intentParser.parse as any).mockReturnValue({
        intent: 'media_request',
        query: 'Inception',
        mediaType: 'movie',
      });
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(conversationSessionRepository.update).toHaveBeenCalledWith('session123', {
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'Inception',
      });
      expect(result.state).toBe('SEARCHING');
      expect(result.message).toContain('Searching for: "Inception"');
    });

    it('should handle selection in AWAITING_SELECTION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = '1';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_SELECTION',
        searchResults: [
          {
            title: 'Inception',
            year: 2010,
            mediaType: 'movie',
            overview: 'A mind-bending thriller',
          },
        ],
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (intentParser.parse as any).mockReturnValue({
        intent: 'selection',
        selectionNumber: 1,
      });
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('AWAITING_CONFIRMATION');
      expect(result.message).toContain('You selected:');
      expect(result.message).toContain('Inception');
    });

    it('should handle confirmation in AWAITING_CONFIRMATION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'yes';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_CONFIRMATION',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (whatsappConnectionRepository.getActive as any).mockResolvedValue({
        autoApprovalMode: 'auto_approve',
      });
      (intentParser.parse as any).mockReturnValue({
        intent: 'confirmation',
        confirmed: true,
      });
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('PROCESSING');
      expect(result.message).toContain('Submitting your request');
    });

    it('should handle cancel from any state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'cancel';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_SELECTION',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (intentParser.parse as any).mockReturnValue({
        intent: 'cancel',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('IDLE');
      expect(result.message).toContain('Request cancelled');
    });

    it('should ignore messages in SEARCHING state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'hello';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'SEARCHING',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'unknown',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('SEARCHING');
      expect(result.message).toContain('Please wait while I search');
    });

    it('should store phone number in activePhoneNumbers map', async () => {
      const phoneNumberHash = 'hash123';
      const phoneNumber = '+1234567890';
      const replyJid = '1234567890@s.whatsapp.net';
      const message = 'hello';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'unknown',
        query: null,
        mediaType: null,
      });

      // New signature: processMessage(hash, message, replyJid, contactName, phoneNumber)
      await service.processMessage(phoneNumberHash, message, replyJid, null, phoneNumber);

      // Access private property for testing
      const activePhoneNumbers = (service as any).activePhoneNumbers;
      expect(activePhoneNumbers.get('session123')).toBe(phoneNumber);
    });

    it('should handle invalid media request in IDLE state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'hello';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'unknown',
        query: null,
        mediaType: null,
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('IDLE');
      expect(result.message).toContain('I can help you find movies');
    });

    it('should handle invalid state transition in IDLE state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'I want to watch Inception';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'IDLE',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'media_request',
        query: 'Inception',
        mediaType: 'movie',
      });
      (stateMachine.processAction as any).mockReturnValue({
        valid: false,
        error: 'Invalid transition',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('IDLE');
      expect(result.message).toContain('An error occurred');
    });

    it('should handle invalid selection number in AWAITING_SELECTION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = '10';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_SELECTION',
        searchResults: [
          {
            title: 'Inception',
            year: 2010,
            mediaType: 'movie',
            overview: 'A mind-bending thriller',
          },
        ],
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'selection',
        selectionNumber: 10,
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('AWAITING_SELECTION');
      expect(result.message).toContain('Please choose a number between 1 and 1');
    });

    it('should handle invalid state transition in AWAITING_SELECTION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = '1';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_SELECTION',
        searchResults: [
          {
            title: 'Inception',
            year: 2010,
            mediaType: 'movie',
            overview: 'A mind-bending thriller',
          },
        ],
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (intentParser.parse as any).mockReturnValue({
        intent: 'selection',
        selectionNumber: 1,
      });
      (stateMachine.processAction as any).mockReturnValue({
        valid: false,
        error: 'Invalid transition',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('AWAITING_SELECTION');
      expect(result.message).toContain('An error occurred');
    });

    it('should handle invalid state transition in AWAITING_CONFIRMATION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'yes';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_CONFIRMATION',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'confirmation',
        confirmed: true,
      });
      (stateMachine.processAction as any).mockReturnValue({
        valid: false,
        error: 'Invalid transition',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('AWAITING_CONFIRMATION');
      expect(result.message).toContain('An error occurred');
    });

    it('should handle auto-deny mode in AWAITING_CONFIRMATION state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'yes';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'AWAITING_CONFIRMATION',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (whatsappConnectionRepository.getActive as any).mockResolvedValue({
        autoApprovalMode: 'auto_deny',
      });
      (intentParser.parse as any).mockReturnValue({
        intent: 'confirmation',
        confirmed: true,
      });
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('PROCESSING');
      expect(result.message).toContain('Processing your request');
    });

    it('should prevent cancellation during PROCESSING state', async () => {
      const phoneNumberHash = 'hash123';
      const message = 'cancel';
      const session = {
        id: 'session123',
        phoneNumberHash,
        state: 'PROCESSING',
        expiresAt: new Date(),
      };

      (conversationSessionRepository.findByPhoneHash as any).mockResolvedValue(session);
      (intentParser.parse as any).mockReturnValue({
        intent: 'cancel',
      });

      const result = await service.processMessage(phoneNumberHash, message);

      expect(result.state).toBe('PROCESSING');
      expect(result.message).toContain('Cannot cancel while processing');
    });
  });

  describe('performSearch', () => {
    it('should handle successful search and send message to user', async () => {
      const sessionId = 'session123';
      const replyJid = '1234567890@s.whatsapp.net';
      const searchResult = {
        results: [
          {
            title: 'Inception',
            year: 2010,
            mediaType: 'movie',
            overview: 'A mind-bending thriller',
          },
        ],
        fromCache: false,
        searchDuration: 500,
      };

      // Set up active reply JID (used for sending messages)
      (service as any).activeReplyJids.set(sessionId, replyJid);

      (mediaSearchService.search as any).mockResolvedValue(searchResult);
      (conversationSessionRepository.findById as any).mockResolvedValue({
        id: sessionId,
        state: 'SEARCHING',
      });
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (stateMachine.processAction as any).mockReturnValue({ valid: true });
      (whatsappClientService.sendMessage as any).mockResolvedValue(undefined);

      await (service as any).performSearch(sessionId, 'movie', 'Inception');

      expect(mediaSearchService.search).toHaveBeenCalledWith('movie', 'Inception', true);
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        replyJid,
        expect.stringContaining('Found 1 result')
      );
    });

    it('should handle search error and send error message', async () => {
      const sessionId = 'session123';
      const replyJid = '1234567890@s.whatsapp.net';
      const error = new Error('Search failed');

      // Set up active reply JID (used for sending messages)
      (service as any).activeReplyJids.set(sessionId, replyJid);

      (mediaSearchService.search as any).mockRejectedValue(error);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (whatsappClientService.sendMessage as any).mockResolvedValue(undefined);

      await (service as any).performSearch(sessionId, 'movie', 'Inception');

      expect(conversationSessionRepository.update).toHaveBeenCalledWith(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        replyJid,
        '❌ Search failed. Please try again later.'
      );
    });

    it('should handle search error when phone number not found', async () => {
      const sessionId = 'session123';
      const error = new Error('Search failed');

      (mediaSearchService.search as any).mockRejectedValue(error);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      // Clear active reply JIDs for this test
      (service as any).activeReplyJids = new Map();

      await (service as any).performSearch(sessionId, 'movie', 'Inception');

      expect(mediaSearchService.search).toHaveBeenCalledWith('movie', 'Inception', true);
      expect(logger.warn).toHaveBeenCalledWith(
        { sessionId },
        'Phone number not found for session - cannot send error message'
      );
      expect(conversationSessionRepository.update).toHaveBeenCalledWith(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });
      expect(conversationSessionRepository.update).toHaveBeenCalledWith(sessionId, {
        state: 'IDLE',
        searchResults: [],
      });
    });
  });

  describe('submitRequest', () => {
    it('should handle successful request submission', async () => {
      const sessionId = 'session123';
      const phoneNumberHash = 'hash123';
      const phoneNumber = '+1234567890';
      const session = {
        id: sessionId,
        state: 'PROCESSING',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
      };

      // Set up active phone number
      (service as any).activePhoneNumbers.set(sessionId, phoneNumber);

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (mediaServiceConfigRepository.findAll as any).mockResolvedValue([
        { id: 'service1', enabled: true, priorityOrder: 1 },
      ]);
      (requestApprovalService.createAndProcessRequest as any).mockResolvedValue({
        status: 'SUBMITTED',
      });

      await (service as any).submitRequest(sessionId, phoneNumberHash);

      expect(requestApprovalService.createAndProcessRequest).toHaveBeenCalledWith(
        phoneNumberHash,
        phoneNumber,
        session.selectedResult,
        'service1',
        undefined, // selectedSeasons - not set in this test
        undefined // contactName - not set in this test
      );
      expect(conversationSessionRepository.update).toHaveBeenCalledWith(sessionId, {
        state: 'IDLE',
      });
    });

    it('should handle request submission failure', async () => {
      const sessionId = 'session123';
      const phoneNumberHash = 'hash123';
      const session = {
        id: sessionId,
        state: 'PROCESSING',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (mediaServiceConfigRepository.findAll as any).mockResolvedValue([
        { id: 'service1', enabled: true, priorityOrder: 1 },
      ]);
      (requestApprovalService.createAndProcessRequest as any).mockResolvedValue({
        status: 'FAILED',
        errorMessage: 'Service unavailable',
      });

      await (service as any).submitRequest(sessionId, phoneNumberHash);

      expect(conversationSessionRepository.update).toHaveBeenCalledWith(sessionId, {
        state: 'IDLE',
      });
    });

    it('should handle no enabled services', async () => {
      const sessionId = 'session123';
      const phoneNumberHash = 'hash123';
      const session = {
        id: sessionId,
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (mediaServiceConfigRepository.findAll as any).mockResolvedValue([]);

      await (service as any).submitRequest(sessionId, phoneNumberHash);

      expect(logger.error).toHaveBeenCalledWith({ sessionId }, 'No enabled services found');
    });

    it('should handle fatal error in submitRequest', async () => {
      const sessionId = 'session123';
      const phoneNumberHash = 'hash123';
      const replyJid = '1234567890@s.whatsapp.net';

      // Set up active reply JID (used for sending messages)
      (service as any).activeReplyJids.set(sessionId, replyJid);

      // Mock handleSubmissionComplete to return a response
      (service as any).handleSubmissionComplete = vi.fn().mockResolvedValue({
        message: 'An unexpected error occurred',
        state: 'IDLE',
        sessionId,
      });

      (conversationSessionRepository.findById as any).mockRejectedValue(
        new Error('Database error')
      );
      (whatsappClientService.sendMessage as any).mockResolvedValue(undefined);

      await (service as any).submitRequest(sessionId, phoneNumberHash);

      expect((service as any).handleSubmissionComplete).toHaveBeenCalledWith(
        sessionId,
        false,
        'An unexpected error occurred'
      );
      expect(whatsappClientService.sendMessage).toHaveBeenCalledWith(
        replyJid,
        'An unexpected error occurred'
      );
    });
  });

  describe('handleSearchComplete', () => {
    it('should handle successful search with results', async () => {
      const sessionId = 'session123';
      const results = [
        {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie' as const,
          overview: 'A mind-bending thriller about dreams',
          posterPath: '/poster.jpg',
          tmdbId: 123,
          tvdbId: null,
          imdbId: 'tt1375666',
          seasonCount: undefined,
        },
      ];
      const session = {
        id: sessionId,
        state: 'SEARCHING',
        searchQuery: 'Inception',
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.handleSearchComplete(sessionId, results);

      expect(result?.state).toBe('AWAITING_SELECTION');
      expect(result?.message).toContain('Found 1 result');
      expect(result?.message).toContain('Inception');
    });

    it('should handle search with no results', async () => {
      const sessionId = 'session123';
      const results: any[] = [];
      const session = {
        id: sessionId,
        state: 'SEARCHING',
        searchQuery: 'nonexistent',
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.handleSearchComplete(sessionId, results);

      expect(result?.state).toBe('IDLE');
      expect(result?.message).toContain('No matches found');
    });

    it('should return null for non-existent session', async () => {
      const sessionId = 'session123';

      (conversationSessionRepository.findById as any).mockResolvedValue(null);

      const result = await service.handleSearchComplete(sessionId, []);

      expect(result).toBeNull();
    });

    it('should return null for session not in SEARCHING state', async () => {
      const sessionId = 'session123';
      const session = {
        id: sessionId,
        state: 'IDLE',
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);

      const result = await service.handleSearchComplete(sessionId, []);

      expect(result).toBeNull();
    });
  });

  describe('handleSubmissionComplete', () => {
    it('should handle successful submission', async () => {
      const sessionId = 'session123';
      const session = {
        id: sessionId,
        state: 'PROCESSING',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.handleSubmissionComplete(sessionId, true);

      expect(result?.state).toBe('IDLE');
      expect(result?.message).toContain('Request submitted successfully');
      expect(result?.message).toContain('Inception');
    });

    it('should handle failed submission', async () => {
      const sessionId = 'session123';
      const session = {
        id: sessionId,
        state: 'PROCESSING',
        selectedResult: {
          title: 'Inception',
          year: 2010,
          mediaType: 'movie',
        },
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);
      (conversationSessionRepository.update as any).mockResolvedValue(undefined);
      (stateMachine.processAction as any).mockReturnValue({ valid: true });

      const result = await service.handleSubmissionComplete(
        sessionId,
        false,
        'Service unavailable'
      );

      expect(result?.state).toBe('IDLE');
      expect(result?.message).toContain('Failed to submit your request');
      expect(result?.message).toContain('Service unavailable');
    });

    it('should return null for non-existent session', async () => {
      const sessionId = 'session123';

      (conversationSessionRepository.findById as any).mockResolvedValue(null);

      const result = await service.handleSubmissionComplete(sessionId, true);

      expect(result).toBeNull();
    });

    it('should return null for session not in PROCESSING state', async () => {
      const sessionId = 'session123';
      const session = {
        id: sessionId,
        state: 'IDLE',
      };

      (conversationSessionRepository.findById as any).mockResolvedValue(session);

      const result = await service.handleSubmissionComplete(sessionId, true);

      expect(result).toBeNull();
    });
  });
});
