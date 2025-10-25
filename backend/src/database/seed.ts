import { db } from '../db';
import { adminUsers } from '../db/schema';
import { passwordService } from '../services/auth/password.service';
import { logger } from '../config/logger';

/**
 * Default admin credentials
 * ⚠️ CHANGE PASSWORD AFTER FIRST LOGIN!
 * Can be overridden with ADMIN_USERNAME and ADMIN_PASSWORD environment variables
 */
const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USERNAME || 'admin@wamr.local',
  password: process.env.ADMIN_PASSWORD || 'changeme123456', // 14 characters - meets 12 char minimum
};

/**
 * Seed database with initial admin user
 */
async function seed(): Promise<void> {
  try {
    logger.info('Starting database seeding...');

    // Check if admin user already exists
    const existingAdmin = await db.query.adminUsers.findFirst({
      where: (users, { eq }) => eq(users.username, DEFAULT_ADMIN.username),
    });

    if (existingAdmin) {
      logger.info('Admin user already exists, skipping seed');
      return;
    }

    // Hash password
    const passwordHash = await passwordService.hash(DEFAULT_ADMIN.password);

    // Insert admin user
    const [admin] = await db
      .insert(adminUsers)
      .values({
        username: DEFAULT_ADMIN.username,
        passwordHash,
      })
      .returning();

    logger.info(
      {
        userId: admin.id,
        username: admin.username,
      },
      'Admin user created successfully'
    );

    // eslint-disable-next-line no-console
    console.log('\n✅ Database seeded successfully!');
    // eslint-disable-next-line no-console
    console.log('\n📝 Default admin credentials:');
    // eslint-disable-next-line no-console
    console.log(`   Username: ${DEFAULT_ADMIN.username}`);
    // eslint-disable-next-line no-console
    console.log(`   Password: ${DEFAULT_ADMIN.password}`);
    // eslint-disable-next-line no-console
    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
    // eslint-disable-next-line no-console
    console.log('');
  } catch (error) {
    logger.error({ error }, 'Database seeding failed');
    throw error;
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => {
      logger.info('Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Seed failed');
      process.exit(1);
    });
}

export { seed };
