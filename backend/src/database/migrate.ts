import { readFileSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { logger } from '../config/logger';
import { runPhoneHashMigration } from '../services/migrations/phone-hash-migration.js';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env file (monorepo setup)
const rootEnvPath = resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath });
dotenv.config(); // Fallback to local .env

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
      let sql = readFileSync(filePath, 'utf-8');
      // Some environments (drizzle-cli) insert statement breakpoint markers like
      // '--> statement-breakpoint' which are not valid SQL for sqlite. Strip those
      // markers before executing the SQL file directly.
      sql = sql.replace(/-->\s*statement-breakpoint/g, '');
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
      } catch (error: unknown) {
        const errMsg = (error as Error)?.message || String(error);
        // If the table/index already exists, assume migration was previously applied
        // and record it in the migrations table so we don't re-apply it.
        if (/already exists/i.test(errMsg) || /duplicate column name/i.test(errMsg)) {
          logger.warn(
            { file, errMsg },
            'Migration appears to be already applied; marking as applied'
          );
          try {
            sqlite
              .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
              .run(hash, Date.now());
            appliedCount++;
          } catch (innerErr) {
            logger.error(
              { innerErr },
              'Failed to mark migration as applied after "already exists"'
            );
            throw error; // Re-throw
          }
        } else {
          logger.error({ error: errMsg, file }, 'Migration failed');
          logger.debug(
            { sql: sql.slice(0, 1000) },
            'Failed SQL (truncated to 1000 chars for inspection)'
          );
          throw error;
        }
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

    // Run post-migration tasks (phone hash migration)
    try {
      await runPhoneHashMigration();
    } catch (err) {
      logger.warn({ err }, 'Phone hash migration failed after DB migrations');
    }
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
