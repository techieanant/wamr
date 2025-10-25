import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { logger } from '../config/logger';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/wamr.db';
const MIGRATIONS_DIR = './drizzle/migrations';

/**
 * Run database migrations
 */
async function migrate(): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    const sqlite = new Database(DATABASE_PATH);

    // Create migrations table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Get list of migration files
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    logger.info({ count: files.length }, 'Found migration files');

    // Get already applied migrations
    const appliedMigrations = sqlite
      .prepare('SELECT hash FROM __drizzle_migrations')
      .all() as Array<{ hash: string }>;

    const appliedHashes = new Set(appliedMigrations.map((m) => m.hash));

    // Apply pending migrations
    let appliedCount = 0;
    for (const file of files) {
      const filePath = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, 'utf-8');
      const hash = file; // Use filename as hash for simplicity

      if (appliedHashes.has(hash)) {
        logger.debug({ file }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ file }, 'Applying migration');

      try {
        sqlite.exec(sql);
        sqlite
          .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
          .run(hash, Date.now());

        appliedCount++;
        logger.info({ file }, 'Migration applied successfully');
      } catch (error) {
        logger.error({ error, file }, 'Migration failed');
        throw error;
      }
    }

    sqlite.close();

    if (appliedCount === 0) {
      logger.info('No pending migrations');
    } else {
      logger.info({ count: appliedCount }, 'Migrations completed successfully');
    }

    // eslint-disable-next-line no-console
    console.log('\n✅ Database migrations completed!');
    // eslint-disable-next-line no-console
    console.log(`   Applied ${appliedCount} migration(s)\n`);
  } catch (error) {
    logger.error({ error }, 'Database migration failed');
    throw error;
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      logger.info('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Migration failed');
      process.exit(1);
    });
}

export { migrate };
