import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestHistoryRepository } from '../../../src/repositories/request-history.repository';
import { db } from '../../../src/db/index.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(),
            })),
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
  requestHistory: {
    id: 'id',
    phoneNumberHash: 'phoneNumberHash',
    phoneNumberEncrypted: 'phoneNumberEncrypted',
    mediaType: 'mediaType',
    title: 'title',
    year: 'year',
    tmdbId: 'tmdbId',
    tvdbId: 'tvdbId',
    serviceType: 'serviceType',
    serviceConfigId: 'serviceConfigId',
    status: 'status',
    conversationLog: 'conversationLog',
    submittedAt: 'submittedAt',
    errorMessage: 'errorMessage',
    adminNotes: 'adminNotes',
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

vi.mock('../../../src/models/request-history.model.js', () => ({
  serializeConversationLog: vi.fn((log) => JSON.stringify(log)),
  deserializeConversationLog: vi.fn((log) => (log ? JSON.parse(log) : null)),
}));

describe('RequestHistoryRepository', () => {
  let repository: RequestHistoryRepository;
  let mockedDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb = db as any;
    repository = new RequestHistoryRepository();
  });

  describe('create', () => {
    it('should create a new request history entry', async () => {
      const mockRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'PENDING',
        conversationLog: JSON.stringify([]),
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockRequest]),
        }),
      });

      const result = await repository.create({
        phoneNumberHash: 'hash123',
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        status: 'PENDING',
      });

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'PENDING',
        conversationLog: [],
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });
  });

  describe('findById', () => {
    it('should return request when found', async () => {
      const mockRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'PENDING',
        conversationLog: JSON.stringify([]),
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockRequest]),
        }),
      });

      const result = await repository.findById(1);

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'PENDING',
        conversationLog: [],
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should return null when request not found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should return paginated requests with filters', async () => {
      const mockRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: null,
          mediaType: 'movie',
          title: 'Test Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: null,
          serviceConfigId: null,
          status: 'PENDING',
          conversationLog: JSON.stringify([]),
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      // Mock count query
      mockedDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        })
        // Mock data query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(mockRequests),
                }),
              }),
            }),
          }),
        });

      const result = await repository.list(
        { phoneNumberHash: 'hash123', status: 'PENDING' },
        { page: 1, pageSize: 10 }
      );

      expect(result).toEqual({
        data: [
          {
            id: 1,
            phoneNumberHash: 'hash123',
            phoneNumberEncrypted: null,
            mediaType: 'movie',
            title: 'Test Movie',
            year: 2023,
            tmdbId: 123,
            tvdbId: null,
            serviceType: null,
            serviceConfigId: null,
            status: 'PENDING',
            conversationLog: [],
            submittedAt: null,
            errorMessage: null,
            adminNotes: null,
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
    });

    it('should filter out mediaType "both"', async () => {
      // Mock count query
      mockedDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        })
        // Mock data query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        });

      const result = await repository.list({ mediaType: 'both' });

      expect(result.total).toBe(0);
    });
  });

  describe('update', () => {
    it('should update request successfully', async () => {
      const updatedRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Updated Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'APPROVED',
        conversationLog: JSON.stringify([]),
        submittedAt: null,
        errorMessage: null,
        adminNotes: 'Approved by admin',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRequest]),
          }),
        }),
      });

      const result = await repository.update(1, {
        status: 'APPROVED',
        adminNotes: 'Approved by admin',
      });

      expect(result?.status).toBe('APPROVED');
      expect(result?.adminNotes).toBe('Approved by admin');
    });

    it('should return null when request not found', async () => {
      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update(999, { status: 'APPROVED' });

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update request status', async () => {
      const updatedRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'SUBMITTED',
        conversationLog: JSON.stringify([]),
        submittedAt: null,
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRequest]),
          }),
        }),
      });

      const result = await repository.updateStatus(1, 'SUBMITTED');

      expect(result?.status).toBe('SUBMITTED');
    });
  });

  describe('markSubmitted', () => {
    it('should mark request as submitted', async () => {
      const submittedRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: 'radarr',
        serviceConfigId: 1,
        status: 'SUBMITTED',
        conversationLog: JSON.stringify([]),
        submittedAt: '2023-01-01T00:01:00.000Z',
        errorMessage: null,
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([submittedRequest]),
          }),
        }),
      });

      const result = await repository.markSubmitted(1, 'radarr', 1);

      expect(result?.status).toBe('SUBMITTED');
      expect(result?.serviceType).toBe('radarr');
      expect(result?.serviceConfigId).toBe(1);
      expect(result?.submittedAt).toBe('2023-01-01T00:01:00.000Z');
    });
  });

  describe('markFailed', () => {
    it('should mark request as failed', async () => {
      const failedRequest = {
        id: 1,
        phoneNumberHash: 'hash123',
        phoneNumberEncrypted: null,
        mediaType: 'movie',
        title: 'Test Movie',
        year: 2023,
        tmdbId: 123,
        tvdbId: null,
        serviceType: null,
        serviceConfigId: null,
        status: 'FAILED',
        conversationLog: JSON.stringify([]),
        submittedAt: null,
        errorMessage: 'Request failed',
        adminNotes: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([failedRequest]),
          }),
        }),
      });

      const result = await repository.markFailed(1, 'Request failed');

      expect(result?.status).toBe('FAILED');
      expect(result?.errorMessage).toBe('Request failed');
    });
  });

  describe('delete', () => {
    it('should delete request successfully', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      });

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when request not found', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 0 }),
      });

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('getRecent', () => {
    it('should return recent requests', async () => {
      const recentRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: null,
          mediaType: 'movie',
          title: 'Recent Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: null,
          serviceConfigId: null,
          status: 'PENDING',
          conversationLog: JSON.stringify([]),
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(recentRequests),
          }),
        }),
      });

      const result = await repository.getRecent(5);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recent Movie');
    });
  });

  describe('getPendingOrFailed', () => {
    it('should return pending or failed requests', async () => {
      const pendingRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: null,
          mediaType: 'movie',
          title: 'Pending Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: null,
          serviceConfigId: null,
          status: 'PENDING',
          conversationLog: JSON.stringify([]),
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(pendingRequests),
          }),
        }),
      });

      const result = await repository.getPendingOrFailed();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('PENDING');
    });
  });

  describe('findByStatus', () => {
    it('should return requests by status', async () => {
      const statusRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: null,
          mediaType: 'movie',
          title: 'Status Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: null,
          serviceConfigId: null,
          status: 'APPROVED',
          conversationLog: JSON.stringify([]),
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(statusRequests),
          }),
        }),
      });

      const result = await repository.findByStatus('APPROVED');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('APPROVED');
    });
  });

  describe('findAll', () => {
    it('should return all requests', async () => {
      const allRequests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          phoneNumberEncrypted: null,
          mediaType: 'movie',
          title: 'All Movie',
          year: 2023,
          tmdbId: 123,
          tvdbId: null,
          serviceType: null,
          serviceConfigId: null,
          status: 'PENDING',
          conversationLog: JSON.stringify([]),
          submittedAt: null,
          errorMessage: null,
          adminNotes: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(allRequests),
        }),
      });

      const result = await repository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('All Movie');
    });
  });

  describe('getStats', () => {
    it('should return statistics for date range', async () => {
      const requests = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          status: 'SUBMITTED',
          createdAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          phoneNumberHash: 'hash456',
          status: 'FAILED',
          createdAt: '2023-01-02T00:00:00.000Z',
        },
        {
          id: 3,
          phoneNumberHash: 'hash789',
          status: 'PENDING',
          createdAt: '2023-01-03T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(requests),
        }),
      });

      const result = await repository.getStats('2023-01-01', '2023-01-31');

      expect(result).toEqual({
        total: 3,
        submitted: 1,
        failed: 1,
        pending: 1,
      });
    });
  });
});
