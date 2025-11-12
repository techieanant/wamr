import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminUserRepository } from '../../../src/repositories/admin-user.repository';
import { db } from '../../../src/db/index.js';

// Mock the database
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(),
      where: vi.fn(() => ({ limit: vi.fn() })),
      limit: vi.fn(),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn() })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })),
    })),
  },
}));

vi.mock('../../../src/db/schema.js', () => ({
  adminUsers: {
    id: 'id',
    username: 'username',
    passwordHash: 'passwordHash',
    createdAt: 'createdAt',
    lastLoginAt: 'lastLoginAt',
  },
}));

describe('AdminUserRepository', () => {
  let repository: AdminUserRepository;
  let mockedDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb = db as any;
    repository = new AdminUserRepository();
  });

  describe('findByUsername', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        passwordHash: 'hashedpass',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastLoginAt: '2023-01-02T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await repository.findByUsername('testuser');

      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        passwordHash: 'hashedpass',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        lastLoginAt: new Date('2023-01-02T00:00:00.000Z'),
      });
    });

    it('should return undefined when user not found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findByUsername('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 123,
        username: 'admin',
        passwordHash: 'hashedpass',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastLoginAt: null,
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      const result = await repository.findById(123);

      expect(result).toEqual({
        id: 123,
        username: 'admin',
        passwordHash: 'hashedpass',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        lastLoginAt: null,
      });
    });

    it('should return undefined when user not found', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create and return new user', async () => {
      const createData = {
        username: 'newuser',
        passwordHash: 'hashedpass',
      };

      const mockCreatedUser = {
        id: 1,
        username: 'newuser',
        passwordHash: 'hashedpass',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastLoginAt: null,
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreatedUser]),
        }),
      });

      const result = await repository.create(createData);

      expect(result).toEqual({
        id: 1,
        username: 'newuser',
        passwordHash: 'hashedpass',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        lastLoginAt: null,
      });
    });
  });

  describe('update', () => {
    it('should update user and return updated data', async () => {
      const updateData = {
        lastLoginAt: new Date('2023-01-03T00:00:00.000Z'),
      };

      const mockUpdatedUser = {
        id: 1,
        username: 'testuser',
        passwordHash: 'hashedpass',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastLoginAt: '2023-01-03T00:00:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedUser]),
          }),
        }),
      });

      const result = await repository.update(1, updateData);

      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        passwordHash: 'hashedpass',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        lastLoginAt: new Date('2023-01-03T00:00:00.000Z'),
      });
    });

    it('should return undefined when user not found', async () => {
      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update(999, { lastLoginAt: new Date() });

      expect(result).toBeUndefined();
    });
  });

  describe('hasAnyUsers', () => {
    it('should return true when users exist', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      });

      const result = await repository.hasAnyUsers();

      expect(result).toBe(true);
    });

    it('should return false when no users exist', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repository.hasAnyUsers();

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return the correct count', async () => {
      const mockResults = [{ count: 1 }, { count: 2 }, { count: 3 }];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockResolvedValue(mockResults),
      });

      const result = await repository.count();

      expect(result).toBe(3);
    });
  });
});
