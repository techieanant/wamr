/**
 * Environment Configuration and Validation
 *
 * Validates all environment variables using Zod schema and provides
 * type-safe access to configuration values throughout the application.
 *
 * Required variables:
 * - JWT_SECRET: Minimum 32 characters for JWT token signing
 * - ENCRYPTION_KEY: 64 hex characters (32 bytes) for AES-256-GCM encryption
 *
 * @module config/environment
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file (monorepo setup)
// Try root directory first (for monorepo), then fallback to current directory
const rootEnvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath });

// Also try loading from backend directory for standalone setup
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),

  // Database
  DATABASE_PATH: z.string().default('./data/wamr.db'),

  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  LOGIN_RATE_LIMIT_MAX: z.string().transform(Number).default('5'),

  // WhatsApp
  WHATSAPP_SESSION_PATH: z.string().default('./.wwebjs_auth'),

  // Media Monitoring
  MEDIA_MONITORING_INTERVAL_MS: z.string().transform(Number).default('300000'), // 5 minutes default

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
});

// Parse and validate environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      console.error('❌ Environment validation failed:');
      missingVars.forEach((msg) => console.error(`  - ${msg}`));
      console.error('\n💡 Please check your .env file and ensure all required variables are set.');
      process.exit(1);
    }
    throw error;
  }
}

// Export validated environment
export const env = validateEnv();

// Type-safe environment object
export type Environment = z.infer<typeof envSchema>;
