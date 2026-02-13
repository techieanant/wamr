import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetupRepository } from '../../../src/repositories/setup.repository';
import { db } from '../../../src/db/index';
import { setupStatus, backupCodes } from '../../../src/db/schema';

// Mock the database
vi.mock('../../../src/db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

describe('SetupRepository', () => {
  let repository: SetupRepository;
  let mockSelect: any;
  let mockInsert: any;
  let mockUpdate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new SetupRepository();

    // Setup mock chain for select
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };
    (db.select as any).mockReturnValue(mockSelect);

    // Setup mock chain for insert
    mockInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    (db.insert as any).mockReturnValue(mockInsert);

    // Setup mock chain for update
    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    (db.update as any).mockReturnValue(mockUpdate);
  });

  describe('isSetupComplete', () => {
    it('should return true when setup is complete', async () => {
      mockSelect.limit.mockResolvedValue([{ isCompleted: true }]);

      const result = await repository.isSetupComplete();

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalled();
      expect(mockSelect.from).toHaveBeenCalledWith(setupStatus);
    });

    it('should return false when setup is not complete', async () => {
      mockSelect.limit.mockResolvedValue([{ isCompleted: false }]);

      const result = await repository.isSetupComplete();

      expect(result).toBe(false);
    });

    it('should return false when no setup status exists', async () => {
      mockSelect.limit.mockResolvedValue([]);

      const result = await repository.isSetupComplete();

      expect(result).toBe(false);
    });
  });

  describe('completeSetup', () => {
    it('should insert or update setup status', async () => {
      await repository.completeSetup();

      expect(db.insert).toHaveBeenCalledWith(setupStatus);
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          isCompleted: true,
          completedAt: expect.any(String),
        })
      );
      expect(mockInsert.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe('createBackupCodes', () => {
    it('should insert backup codes', async () => {
      const codes = [
        { adminUserId: 1, codeHash: 'hash1' },
        { adminUserId: 1, codeHash: 'hash2' },
      ];

      const mockValues = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({ values: mockValues });

      await repository.createBackupCodes(codes);

      expect(db.insert).toHaveBeenCalledWith(backupCodes);
      expect(mockValues).toHaveBeenCalledWith(codes);
    });
  });

  describe('findValidBackupCode', () => {
    it('should find backup code by hash', async () => {
      const mockCode = {
        id: 1,
        adminUserId: 1,
        codeHash: 'hash1',
        isUsed: 0,
        usedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      mockSelect.limit.mockResolvedValue([mockCode]);

      const result = await repository.findValidBackupCode('hash1');

      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          adminUserId: 1,
          codeHash: 'hash1',
          isUsed: false,
        })
      );
    });

    it('should return undefined when code not found', async () => {
      mockSelect.limit.mockResolvedValue([]);

      const result = await repository.findValidBackupCode('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('markBackupCodeUsed', () => {
    it('should mark code as used', async () => {
      await repository.markBackupCodeUsed(1);

      expect(db.update).toHaveBeenCalledWith(backupCodes);
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isUsed: true,
          usedAt: expect.any(String),
        })
      );
    });
  });

  describe('getUnusedBackupCodesCount', () => {
    it('should return count of unused codes', async () => {
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await repository.getUnusedBackupCodesCount(1);

      expect(result).toBe(2);
    });

    it('should return 0 when no unused codes exist', async () => {
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockResolvedValue([]);

      const result = await repository.getUnusedBackupCodesCount(1);

      expect(result).toBe(0);
    });
  });

  describe('hasAnyBackupCodes', () => {
    it('should return true when user has backup codes', async () => {
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockReturnThis();
      mockSelect.limit.mockResolvedValue([{ id: 1 }]);

      const result = await repository.hasAnyBackupCodes(1);

      expect(result).toBe(true);
    });

    it('should return false when user has no backup codes', async () => {
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockReturnThis();
      mockSelect.limit.mockResolvedValue([]);

      const result = await repository.hasAnyBackupCodes(1);

      expect(result).toBe(false);
    });
  });

  describe('getAllBackupCodes', () => {
    it('should return all backup codes for user', async () => {
      const mockCodes = [
        {
          id: 1,
          adminUserId: 1,
          codeHash: 'hash1',
          isUsed: 0,
          usedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          adminUserId: 1,
          codeHash: 'hash2',
          isUsed: 1,
          usedAt: '2024-01-02T00:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockResolvedValue(mockCodes);

      const result = await repository.getAllBackupCodes(1);

      expect(result).toHaveLength(2);
      expect(result[0].isUsed).toBe(false);
      expect(result[1].isUsed).toBe(true);
    });

    it('should return empty array when no codes exist', async () => {
      mockSelect.from.mockReturnThis();
      mockSelect.where.mockResolvedValue([]);

      const result = await repository.getAllBackupCodes(1);

      expect(result).toEqual([]);
    });
  });
});
