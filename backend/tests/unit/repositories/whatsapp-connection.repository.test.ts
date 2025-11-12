import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WhatsAppConnectionRepository } from '../../../src/repositories/whatsapp-connection.repository';
import { db } from '../../../src/db/index.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(),
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
  },
}));

vi.mock('../../../src/db/schema.js', () => ({
  whatsappConnections: {
    id: 'id',
    phoneNumberHash: 'phoneNumberHash',
    status: 'status',
    lastConnectedAt: 'lastConnectedAt',
    qrCodeGeneratedAt: 'qrCodeGeneratedAt',
    filterType: 'filterType',
    filterValue: 'filterValue',
    autoApprovalMode: 'autoApprovalMode',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

describe('WhatsAppConnectionRepository', () => {
  let repository: WhatsAppConnectionRepository;
  let mockedDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb = db as any;
    repository = new WhatsAppConnectionRepository();
  });

  describe('getActive', () => {
    it('should return active connection when found', async () => {
      const mockConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: '2023-01-01T00:00:00.000Z',
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockConnection]),
          }),
        }),
      });

      const result = await repository.getActive();

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-01T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      });
    });

    it('should return undefined when no active connection', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.getActive();

      expect(result).toBeUndefined();
    });
  });

  describe('findByPhoneHash', () => {
    it('should return connection when found', async () => {
      const mockConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: '2023-01-01T00:00:00.000Z',
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockConnection]),
          }),
        }),
      });

      const result = await repository.findByPhoneHash('hash123');

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-01T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      });
    });

    it('should return undefined when connection not found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findByPhoneHash('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should update existing connection', async () => {
      const existingConnections = [
        {
          id: 1,
          phoneNumberHash: 'oldhash',
          status: 'DISCONNECTED',
          lastConnectedAt: null,
          qrCodeGeneratedAt: null,
          filterType: null,
          filterValue: null,
          autoApprovalMode: 'auto_approve',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      const updatedConnection = {
        id: 1,
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: '2023-01-02T00:00:00.000Z',
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      // Mock findAll
      repository.findAll = vi.fn().mockResolvedValue(existingConnections);

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedConnection]),
          }),
        }),
      });

      const result = await repository.upsert({
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
      });

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });

    it('should insert new connection when none exists', async () => {
      const newConnection = {
        id: 1,
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: '2023-01-02T00:00:00.000Z',
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-02T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      // Mock findAll
      repository.findAll = vi.fn().mockResolvedValue([]);

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newConnection]),
        }),
      });

      const result = await repository.upsert({
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
      });

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'newhash',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-02T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });
  });

  describe('update', () => {
    it('should update connection successfully', async () => {
      const updatedConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: '2023-01-02T00:00:00.000Z',
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedConnection]),
          }),
        }),
      });

      const result = await repository.update(1, {
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
      });

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-02T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });

    it('should return undefined when connection not found', async () => {
      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update(999, { status: 'CONNECTED' });

      expect(result).toBeUndefined();
    });
  });

  describe('updateMessageFilter', () => {
    it('should update message filter successfully', async () => {
      const connections = [
        {
          id: 1,
          phoneNumberHash: 'hash123',
          status: 'CONNECTED',
          lastConnectedAt: null,
          qrCodeGeneratedAt: null,
          filterType: null,
          filterValue: null,
          autoApprovalMode: 'auto_approve',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      const updatedConnection = {
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: null,
        qrCodeGeneratedAt: null,
        filterType: 'prefix',
        filterValue: 'test',
        autoApprovalMode: 'auto_approve',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-02T00:00:00.000Z',
      };

      repository.findAll = vi.fn().mockResolvedValue(connections);

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedConnection]),
          }),
        }),
      });

      const result = await repository.updateMessageFilter('prefix', 'test');

      expect(result).toEqual({
        id: 1,
        phoneNumberHash: 'hash123',
        status: 'CONNECTED',
        lastConnectedAt: null,
        qrCodeGeneratedAt: null,
        filterType: 'prefix',
        filterValue: 'test',
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });

    it('should return undefined when no connections exist', async () => {
      repository.findAll = vi.fn().mockResolvedValue([]);

      const result = await repository.updateMessageFilter('prefix', 'test');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all connections', async () => {
      const mockConnections = [
        {
          id: 1,
          phoneNumberHash: 'hash1',
          status: 'CONNECTED',
          lastConnectedAt: '2023-01-01T00:00:00.000Z',
          qrCodeGeneratedAt: null,
          filterType: null,
          filterValue: null,
          autoApprovalMode: 'auto_approve',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          phoneNumberHash: 'hash2',
          status: 'DISCONNECTED',
          lastConnectedAt: null,
          qrCodeGeneratedAt: '2023-01-02T00:00:00.000Z',
          filterType: 'keyword',
          filterValue: 'approve',
          autoApprovalMode: 'manual',
          createdAt: '2023-01-02T00:00:00.000Z',
          updatedAt: '2023-01-02T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockResolvedValue(mockConnections),
      });

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        phoneNumberHash: 'hash1',
        status: 'CONNECTED',
        lastConnectedAt: new Date('2023-01-01T00:00:00.000Z'),
        qrCodeGeneratedAt: null,
        filterType: null,
        filterValue: null,
        autoApprovalMode: 'auto_approve',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      });
      expect(result[1]).toEqual({
        id: 2,
        phoneNumberHash: 'hash2',
        status: 'DISCONNECTED',
        lastConnectedAt: null,
        qrCodeGeneratedAt: new Date('2023-01-02T00:00:00.000Z'),
        filterType: 'keyword',
        filterValue: 'approve',
        autoApprovalMode: 'manual',
        createdAt: new Date('2023-01-02T00:00:00.000Z'),
        updatedAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });
  });
});
