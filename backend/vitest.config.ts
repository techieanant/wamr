import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/*.ts',
        // Build and config files
        'build.js',
        'drizzle.config.ts',
        // Entry point
        'src/index.ts',
        // Routes (just route definitions)
        'src/api/routes/**/*.ts',
        // Validators (just Zod schemas)
        'src/api/validators/**/*.ts',
        // Config files
        'src/config/**/*.ts',
        // Database setup and migrations
        'src/database/**/*.ts',
        'src/db/index.ts',
        // Models (just type definitions)
        'src/models/**/*.ts',
        // Utils (simple utilities)
        'src/utils/**/*.ts',
        // Integration-heavy services that are hard to unit test
        'src/services/media-monitoring/**/*.ts',
        'src/services/websocket/**/*.ts',
        'src/services/whatsapp/**/*.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
