#!/usr/bin/env tsx
import { runPhoneHashMigration } from '../src/services/migrations/phone-hash-migration.js';
import { logger } from '../src/config/logger.js';

(async () => {
  try {
    await runPhoneHashMigration();
    logger.info('Phone hash migration script completed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Phone hash migration script failed');
    process.exit(1);
  }
})();
