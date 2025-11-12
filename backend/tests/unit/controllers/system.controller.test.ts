import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Request, Response } from 'express';
import { getSystemInfo } from '../../../src/api/controllers/system.controller';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../src/config/environment', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));
vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mock/path'),
}));
vi.mock('path', () => ({
  dirname: vi.fn(() => '/mock/dir'),
  join: vi.fn(() => '/mock/package.json'),
}));

// Import mocked functions
import { readFileSync } from 'fs';

// Mock process
const mockProcess = {
  version: 'v18.17.0',
  platform: 'darwin',
  uptime: vi.fn(() => 3600), // 1 hour
  memoryUsage: vi.fn(() => ({
    heapUsed: 50 * 1024 * 1024, // 50MB
    heapTotal: 100 * 1024 * 1024, // 100MB
    rss: 80 * 1024 * 1024, // 80MB
  })),
};

Object.defineProperty(global, 'process', {
  value: mockProcess,
  writable: true,
});

describe('System Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {};
    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('getSystemInfo', () => {
    it('should return system information successfully', async () => {
      const mockPackageJson = {
        version: '1.2.3',
        schemaVersion: '2.1.0',
      };

      (readFileSync as Mock).mockReturnValue(JSON.stringify(mockPackageJson));

      await getSystemInfo(mockRequest as Request, mockResponse as Response);

      expect(readFileSync).toHaveBeenCalledWith('/mock/package.json', 'utf-8');
      expect(logger.debug).toHaveBeenCalledWith(
        {
          systemInfo: {
            version: '1.2.3',
            schemaVersion: '2.1.0',
            environment: 'test',
            nodeVersion: 'v18.17.0',
            platform: 'darwin',
            uptime: 3600,
            memoryUsage: {
              heapUsed: 50,
              heapTotal: 100,
              rss: 80,
            },
          },
        },
        'Retrieved system information'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        version: '1.2.3',
        schemaVersion: '2.1.0',
        environment: 'test',
        nodeVersion: 'v18.17.0',
        platform: 'darwin',
        uptime: 3600,
        memoryUsage: {
          heapUsed: 50,
          heapTotal: 100,
          rss: 80,
        },
      });
    });

    it('should use default schemaVersion when not in package.json', async () => {
      const mockPackageJson = {
        version: '1.2.3',
        // schemaVersion not present
      };

      (readFileSync as Mock).mockReturnValue(JSON.stringify(mockPackageJson));

      await getSystemInfo(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        version: '1.2.3',
        schemaVersion: '1.0.0',
        environment: 'test',
        nodeVersion: 'v18.17.0',
        platform: 'darwin',
        uptime: 3600,
        memoryUsage: {
          heapUsed: 50,
          heapTotal: 100,
          rss: 80,
        },
      });
    });

    it('should use default values when package.json cannot be read', async () => {
      (readFileSync as Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      await getSystemInfo(mockRequest as Request, mockResponse as Response);

      expect(logger.warn).toHaveBeenCalledWith('Could not read version from package.json');
      expect(mockResponse.json).toHaveBeenCalledWith({
        version: '1.0.0',
        schemaVersion: '1.0.0',
        environment: 'test',
        nodeVersion: 'v18.17.0',
        platform: 'darwin',
        uptime: 3600,
        memoryUsage: {
          heapUsed: 50,
          heapTotal: 100,
          rss: 80,
        },
      });
    });
  });
});
