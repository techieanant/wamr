import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');
const isProduction = process.env.NODE_ENV === 'production';
const envFile = isProduction ? '.env.prod' : '.env.local';
const envPath = join(rootDir, envFile);

dotenv.config({ path: envPath });

import { setupService } from '../services/setup/setup.service.js';
import { adminUserRepository } from '../repositories/admin-user.repository.js';
import { passwordService } from '../services/auth/password.service.js';
import { logger } from '../config/logger.js';

/**
 * Check for password reset via environment variable
 */
async function checkPasswordReset(): Promise<void> {
  const resetPassword = process.env.RESET_ADMIN_PASSWORD;
  if (!resetPassword) return;

  logger.info('Password reset flag detected');

  const user = await adminUserRepository.findById(1);
  if (!user) {
    logger.warn('Cannot reset password: admin user not found');
    return;
  }

  const newPassword = resetPassword === 'random' ? generateSecurePassword() : resetPassword;

  const passwordHash = await passwordService.hash(newPassword);
  await adminUserRepository.updatePassword(user.id, passwordHash);

  logger.info({ username: user.username }, 'Admin password has been reset');

  // eslint-disable-next-line no-console
  console.log('\n🔐 PASSWORD RESET COMPLETE');
  // eslint-disable-next-line no-console
  console.log(`   Username: ${user.username}`);
  // eslint-disable-next-line no-console
  console.log(`   New Password: ${newPassword}`);
  // eslint-disable-next-line no-console
  console.log('\n⚠️  SECURITY WARNING:');
  // eslint-disable-next-line no-console
  console.log('   Remove RESET_ADMIN_PASSWORD from your environment to prevent');
  // eslint-disable-next-line no-console
  console.log('   repeated password resets on every container restart.');
  // eslint-disable-next-line no-console
  console.log('');
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const length = 16;
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Seed database with initial admin user
 */
async function seed(): Promise<void> {
  try {
    logger.info('Starting database seeding...');

    // Check if setup is already complete
    const isSetupComplete = await setupService.isSetupComplete();
    if (isSetupComplete) {
      logger.info('Setup already complete, skipping seed');

      // Check for password reset flag
      await checkPasswordReset();
      return;
    }

    // Check if any admin users exist
    const hasUsers = await adminUserRepository.hasAnyUsers();
    if (hasUsers) {
      logger.info('Admin user already exists, marking setup complete');
      await setupService.completeSetup();

      // Check if backup codes need to be generated for existing user
      const admin = await adminUserRepository.findById(1);
      if (admin) {
        const hasCodes = await setupService.hasBackupCodes(admin.id);
        if (!hasCodes) {
          logger.info('Generating backup codes for existing admin user');
          const codes = await setupService.generateBackupCodesForExistingUser(admin.id);

          // eslint-disable-next-line no-console
          console.log(
            '\n📝 Backup codes have been generated. Save these in a secure password manager:'
          );
          codes.forEach((code, index) => {
            // eslint-disable-next-line no-console
            console.log(`   ${index + 1}. ${code}`);
          });
          // eslint-disable-next-line no-console
          console.log(
            '\n⚠️  These codes can be used to reset your password if you get locked out.'
          );
          // eslint-disable-next-line no-console
          console.log('   Each code can only be used once.\n');
        }
      }

      // Check for password reset flag
      await checkPasswordReset();
      return;
    }

    // Check if using env-based credentials (for backwards compatibility/automation)
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      logger.info('Creating admin user from environment variables');

      const result = await setupService.createInitialAdmin(
        process.env.ADMIN_USERNAME,
        process.env.ADMIN_PASSWORD
      );

      logger.info({ userId: result.adminId }, 'Admin user created from environment variables');

      // eslint-disable-next-line no-console
      console.log('\n✅ Database seeded successfully from environment variables!');
      // eslint-disable-next-line no-console
      console.log('\n📝 Backup codes have been generated:');
      result.backupCodes.forEach((code, index) => {
        // eslint-disable-next-line no-console
        console.log(`   ${index + 1}. ${code}`);
      });
      // eslint-disable-next-line no-console
      console.log('\n⚠️  IMPORTANT: Save these backup codes in a secure password manager!');
      // eslint-disable-next-line no-console
      console.log('   You will not see them again.\n');
    } else {
      logger.info('No admin credentials in env, skipping seed (setup wizard will be shown)');
    }

    // Check for password reset flag
    await checkPasswordReset();
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
