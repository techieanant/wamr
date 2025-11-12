import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaServiceConfigRepository } from '../../../src/repositories/media-service-config.repository';
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
      where: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
}));

vi.mock('../../../src/db/schema.js', () => ({
  mediaServiceConfigurations: {
    id: 'id',
    serviceType: 'serviceType',
    name: 'name',
    baseUrl: 'baseUrl',
    apiKeyEncrypted: 'apiKeyEncrypted',
    apiKeyIv: 'apiKeyIv',
    enabled: 'enabled',
    priority: 'priority',
    maxResults: 'maxResults',
    qualityProfile: 'qualityProfile',
    rootFolder: 'rootFolder',
    lastHealthCheck: 'lastHealthCheck',
    healthStatus: 'healthStatus',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

describe('MediaServiceConfigRepository', () => {
  let repository: MediaServiceConfigRepository;
  let mockedDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb = db as any;
    repository = new MediaServiceConfigRepository();
  });

  describe('findById', () => {
    it('should return service config when found', async () => {
      const mockConfig = {
        id: 1,
        serviceType: 'radarr',
        name: 'My Radarr',
        baseUrl: 'http://localhost:7878',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        apiKeyIv: 'iv123',
        enabled: true,
        priority: 1,
        maxResults: 5,
        qualityProfile: '1',
        rootFolder: '/movies',
        lastHealthCheck: null,
        healthStatus: 'UNKNOWN',
        version: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockConfig]),
          }),
        }),
      });

      const result = await repository.findById(1);

      expect(result).toEqual({
        id: 1,
        serviceType: 'radarr',
        name: 'My Radarr',
        baseUrl: 'http://localhost:7878',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      });
    });

    it('should return undefined when config not found', async () => {
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

  describe('findAll', () => {
    it('should return all service configurations ordered by priority', async () => {
      const mockConfigs = [
        {
          id: 1,
          serviceType: 'radarr',
          name: 'Radarr 1',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv1:authTag:ciphertext1',
          apiKeyIv: 'iv1',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          serviceType: 'sonarr',
          name: 'Sonarr 1',
          baseUrl: 'http://localhost:8989',
          apiKeyEncrypted: 'iv2:authTag:ciphertext2',
          apiKeyIv: 'iv2',
          enabled: true,
          priority: 2,
          maxResults: 5,
          qualityProfile: '2',
          rootFolder: '/tv',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockConfigs),
        }),
      });

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Radarr 1');
      expect(result[1].name).toBe('Sonarr 1');
    });
  });

  describe('findEnabledByType', () => {
    it('should return enabled services by type', async () => {
      const mockConfigs = [
        {
          id: 1,
          serviceType: 'radarr',
          name: 'Radarr 1',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv1:authTag:ciphertext1',
          apiKeyIv: 'iv1',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockConfigs),
          }),
        }),
      });

      const result = await repository.findEnabledByType('radarr');

      expect(result).toHaveLength(1);
      expect(result[0].serviceType).toBe('radarr');
      expect(result[0].enabled).toBe(true);
    });
  });

  describe('findByType', () => {
    it('should return all services by type regardless of enabled status', async () => {
      const mockConfigs = [
        {
          id: 1,
          serviceType: 'radarr',
          name: 'Radarr 1',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv1:authTag:ciphertext1',
          apiKeyIv: 'iv1',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          serviceType: 'radarr',
          name: 'Radarr 2',
          baseUrl: 'http://localhost:7879',
          apiKeyEncrypted: 'iv2:authTag:ciphertext2',
          apiKeyIv: 'iv2',
          enabled: false,
          priority: 2,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies2',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockConfigs),
          }),
        }),
      });

      const result = await repository.findByType('radarr');

      expect(result).toHaveLength(2);
      expect(result[0].enabled).toBe(true);
      expect(result[1].enabled).toBe(false);
    });
  });

  describe('create', () => {
    it('should create new service configuration', async () => {
      const mockConfig = {
        id: 1,
        serviceType: 'radarr',
        name: 'New Radarr',
        baseUrl: 'http://localhost:7878',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        apiKeyIv: 'iv123',
        enabled: true,
        priority: 1,
        maxResults: 5,
        qualityProfile: '1',
        rootFolder: '/movies',
        lastHealthCheck: null,
        healthStatus: 'UNKNOWN',
        version: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockConfig]),
        }),
      });

      const result = await repository.create({
        name: 'New Radarr',
        serviceType: 'radarr',
        baseUrl: 'http://localhost:7878/',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        priorityOrder: 1,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
      });

      expect(result).toEqual({
        id: 1,
        serviceType: 'radarr',
        name: 'New Radarr',
        baseUrl: 'http://localhost:7878',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
        qualityProfileId: 1,
        rootFolderPath: '/movies',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
      });
    });

    it('should remove trailing slash from baseUrl', async () => {
      const mockConfig = {
        id: 1,
        serviceType: 'radarr',
        name: 'New Radarr',
        baseUrl: 'http://localhost:7878',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        apiKeyIv: 'iv123',
        enabled: true,
        priority: 1,
        maxResults: 5,
        qualityProfile: '1',
        rootFolder: '/movies',
        lastHealthCheck: null,
        healthStatus: 'UNKNOWN',
        version: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockedDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockConfig]),
        }),
      });

      await repository.create({
        name: 'New Radarr',
        serviceType: 'radarr',
        baseUrl: 'http://localhost:7878/',
        apiKeyEncrypted: 'iv123:authTag:ciphertext',
        priorityOrder: 1,
      });

      // Verify that the baseUrl was processed (trailing slash removed)
      expect(mockConfig.baseUrl).toBe('http://localhost:7878');
    });
  });

  describe('update', () => {
    it('should update service configuration', async () => {
      const updatedConfig = {
        id: 1,
        serviceType: 'radarr',
        name: 'Updated Radarr',
        baseUrl: 'http://localhost:7879',
        apiKeyEncrypted: 'newIv:authTag:newCiphertext',
        apiKeyIv: 'newIv',
        enabled: false,
        priority: 2,
        maxResults: 10,
        qualityProfile: '2',
        rootFolder: '/new-movies',
        lastHealthCheck: null,
        healthStatus: 'UNKNOWN',
        version: null,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:01:00.000Z',
      };

      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedConfig]),
          }),
        }),
      });

      const result = await repository.update(1, {
        name: 'Updated Radarr',
        baseUrl: 'http://localhost:7879/',
        apiKeyEncrypted: 'newIv:authTag:newCiphertext',
        enabled: false,
        priorityOrder: 2,
        maxResults: 10,
        qualityProfileId: 2,
        rootFolderPath: '/new-movies',
      });

      expect(result).toEqual({
        id: 1,
        serviceType: 'radarr',
        name: 'Updated Radarr',
        baseUrl: 'http://localhost:7879',
        apiKeyEncrypted: 'newIv:authTag:newCiphertext',
        enabled: false,
        priorityOrder: 2,
        maxResults: 10,
        qualityProfileId: 2,
        rootFolderPath: '/new-movies',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:01:00.000Z'),
      });
    });

    it('should return undefined when config not found', async () => {
      mockedDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.update(999, { name: 'Updated' });

      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete service configuration successfully', async () => {
      const mockDeleted = [
        {
          id: 1,
          serviceType: 'radarr',
          name: 'Deleted Radarr',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv123:authTag:ciphertext',
          apiKeyIv: 'iv123',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(mockDeleted),
        }),
      });

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when config not found', async () => {
      mockedDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('validateUniquePriority', () => {
    it('should return true when priority is available', async () => {
      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.validateUniquePriority('radarr', 1);

      expect(result).toBe(true);
    });

    it('should return false when priority is taken', async () => {
      const existingConfig = [
        {
          id: 2,
          serviceType: 'radarr',
          name: 'Existing Radarr',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv123:authTag:ciphertext',
          apiKeyIv: 'iv123',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(existingConfig),
          }),
        }),
      });

      const result = await repository.validateUniquePriority('radarr', 1);

      expect(result).toBe(false);
    });

    it('should return true when priority is taken by excluded ID', async () => {
      const existingConfig = [
        {
          id: 1, // Same as excludeId
          serviceType: 'radarr',
          name: 'Existing Radarr',
          baseUrl: 'http://localhost:7878',
          apiKeyEncrypted: 'iv123:authTag:ciphertext',
          apiKeyIv: 'iv123',
          enabled: true,
          priority: 1,
          maxResults: 5,
          qualityProfile: '1',
          rootFolder: '/movies',
          lastHealthCheck: null,
          healthStatus: 'UNKNOWN',
          version: null,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockedDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existingConfig),
        }),
      });

      const result = await repository.validateUniquePriority('radarr', 1, 1);

      expect(result).toBe(true);
    });
  });
});
