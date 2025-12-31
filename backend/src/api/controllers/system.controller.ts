import { Request, Response } from 'express';
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get system information
 * Returns version, environment, and other system details
 */
export async function getSystemInfo(_req: Request, res: Response): Promise<void> {
  try {
    // Read version from root package.json (monorepo root)
    let version = '1.0.0';
    let schemaVersion = '1.0.0';

    try {
      // In Docker: /app/root-package.json (root monorepo package.json)
      // In dev: backend/src/api/controllers -> ../../../../package.json
      let packageJsonPath = join(__dirname, '../../../../package.json');

      // Check if we're in Docker (built files are in /app/dist)
      if (__dirname.includes('/app/dist')) {
        packageJsonPath = '/app/root-package.json';
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version || '1.0.0';
      schemaVersion = packageJson.schemaVersion || '1.0.0';
    } catch (error) {
      logger.warn('Could not read version from package.json');
    }

    const systemInfo = {
      version,
      schemaVersion,
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };

    logger.debug({ systemInfo }, 'Retrieved system information');
    res.json(systemInfo);
  } catch (error) {
    logger.error({ error }, 'Error fetching system information');
    res.status(500).json({
      error: 'SYSTEM_INFO_ERROR',
      message: 'Failed to retrieve system information',
    });
  }
}
