import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from root .env first
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootEnvPath = resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath });
dotenv.config(); // Fallback to local .env if needed

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { logger } from '../config/logger';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/wamr.db';

// Create database connection
const sqlite = new Database(DATABASE_PATH);

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');

logger.info({ path: DATABASE_PATH }, 'Database connection established');

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Health check function
export function checkDatabaseHealth(): boolean {
  try {
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}

// Graceful shutdown
export function closeDatabaseConnection(): void {
  try {
    sqlite.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connection');
  }
}
