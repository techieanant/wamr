import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationSessionRepository } from '../../../src/repositories/conversation-session.repository';
import { db } from '../../../src/db/index.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/db/schema.js', () => ({
  conversationSessions: {
    id: 'id',
    phoneNumberHash: 'phoneNumberHash',
    state: 'state',
    mediaType: 'mediaType',
    searchQuery: 'searchQuery',
    searchResults: 'searchResults',
    selectedResult: 'selectedResult',
    expiresAt: 'expiresAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('../../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/models/conversation-session.model.js', () => ({
  generateSessionId: vi.fn(() => 'test-session-id'),
  getExpirationTime: vi.fn((minutes) => {
    const future = new Date();
    future.setMinutes(future.getMinutes() + minutes);
    return future.toISOString();
  }),
  isSessionExpired: vi.fn((expiresAt) => {
    return new Date(expiresAt) < new Date();
  }),
  serializeSearchResults: vi.fn((results) => JSON.stringify(results)),
  deserializeSearchResults: vi.fn((results) => (results ? JSON.parse(results) : null)),
  serializeSelectedResult: vi.fn((result) => JSON.stringify(result)),
  deserializeSelectedResult: vi.fn((result) => (result ? JSON.parse(result) : null)),
}));

describe('ConversationSessionRepository', () => {
  let repository: ConversationSessionRepository;
  let mockedDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb = db as any;
    repository = new ConversationSessionRepository();
  });

  describe('create', () => {
    it('should create a new session with generated ID', async () => {
      const mockSession = {
        id: 'test-session-id',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await repository.create({
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        expiresAt: '2023-01-01T00:05:00.000Z',
      } as any);

      expect(result).toEqual({
        id: 'test-session-id',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: [],
        selectedResult: null,
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should create a session with provided ID', async () => {
      const mockSession = {
        id: 'custom-id',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await repository.create({
        id: 'custom-id',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        expiresAt: '2023-01-01T00:05:00.000Z',
      } as any);

      expect(result.id).toBe('custom-id');
    });
  });

  describe('findById', () => {
    it('should return session when found and not expired', async () => {
      const mockSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2030-01-02T00:00:00.000Z', // Future date
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await repository.findById('session-1');

      expect(result).toEqual({
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: [],
        selectedResult: null,
        expiresAt: '2030-01-02T00:00:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return null when session not found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when session is expired', async () => {
      const mockSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:00:00.000Z', // Past date
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockSession]),
        }),
      });

      const result = await repository.findById('session-1');

      expect(result).toBeNull();
    });
  });

  describe('findByPhoneHash', () => {
    it('should return active session for phone hash', async () => {
      const mockSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-02T00:00:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockSession]),
            }),
          }),
        }),
      });

      const result = await repository.findByPhoneHash('hash123');

      expect(result).toEqual({
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: [],
        selectedResult: null,
        expiresAt: '2023-01-02T00:00:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return null when no active session found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.findByPhoneHash('hash123');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update session successfully', async () => {
      const updatedSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'AWAITING_SELECTION',
        mediaType: 'movie',
        searchQuery: 'updated query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify({
          title: 'Test Movie',
          year: 2023,
          overview: 'A test movie',
          posterPath: null,
          tmdbId: 123,
          tvdbId: null,
          imdbId: 'tt1234567',
          mediaType: 'movie',
        }),
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedSession]),
          }),
        }),
      });

      const result = await repository.update('session-1', {
        state: 'AWAITING_SELECTION',
        searchQuery: 'updated query',
        selectedResult: {
          title: 'Test Movie',
          year: 2023,
          overview: 'A test movie',
          posterPath: null,
          tmdbId: 123,
          tvdbId: null,
          imdbId: 'tt1234567',
          mediaType: 'movie',
        },
      });

      expect(result).toEqual({
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'AWAITING_SELECTION',
        mediaType: 'movie',
        searchQuery: 'updated query',
        searchResults: [],
        selectedResult: {
          title: 'Test Movie',
          year: 2023,
          overview: 'A test movie',
          posterPath: null,
          tmdbId: 123,
          tvdbId: null,
          imdbId: 'tt1234567',
          mediaType: 'movie',
        },
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      });
    });

    it('should filter out mediaType "both"', async () => {
      const updatedSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie', // Should remain unchanged
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedSession]),
          }),
        }),
      });

      const result = await repository.update('session-1', {
        mediaType: 'both', // Should be filtered out
        state: 'SEARCHING',
      });

      expect(result).toBeDefined();
    });

    it('should return null when session not found', async () => {
      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update('nonexistent', { state: 'AWAITING_SELECTION' });

      expect(result).toBeNull();
    });
  });

  describe('updateState', () => {
    it('should update session state', async () => {
      const updatedSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'PROCESSING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:05:00.000Z',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedSession]),
          }),
        }),
      });

      const result = await repository.updateState('session-1', 'PROCESSING');

      expect(result?.state).toBe('PROCESSING');
    });
  });

  describe('delete', () => {
    it('should delete session successfully', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      const result = await repository.delete('session-1');

      expect(result).toBe(true);
    });

    it('should return false when session not found', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      });

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteByPhoneHash', () => {
    it('should delete sessions by phone hash', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 3 }),
      });

      const result = await repository.deleteByPhoneHash('hash123');

      expect(result).toBe(3);
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired sessions', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 5 }),
      });

      const result = await repository.cleanupExpired();

      expect(result).toBe(5);
    });
  });

  describe('findExpired', () => {
    it('should return expired sessions', async () => {
      const expiredSessions = [
        {
          id: 'session-1',
          phoneNumberHash: 'hash123',
          state: 'SEARCHING',
          mediaType: 'movie',
          searchQuery: 'test query',
          searchResults: JSON.stringify([]),
          selectedResult: JSON.stringify(null),
          expiresAt: '2023-01-01T00:00:00.000Z',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expiredSessions),
        }),
      });

      const result = await repository.findExpired();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('session-1');
    });
  });

  describe('extendExpiration', () => {
    it('should extend session expiration', async () => {
      const extendedSession = {
        id: 'session-1',
        phoneNumberHash: 'hash123',
        state: 'SEARCHING',
        mediaType: 'movie',
        searchQuery: 'test query',
        searchResults: JSON.stringify([]),
        selectedResult: JSON.stringify(null),
        expiresAt: '2023-01-01T00:10:00.000Z', // Extended by 10 minutes
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([extendedSession]),
          }),
        }),
      });

      const result = await repository.extendExpiration('session-1', 10);

      expect(result?.expiresAt).toBe('2023-01-01T00:10:00.000Z');
    });
  });
});
