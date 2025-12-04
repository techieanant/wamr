import * as esbuild from 'esbuild';

const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: [
    // Don't bundle node_modules - they're installed in Docker
    'express',
    'socket.io',
    'whatsapp-web.js',
    'drizzle-orm',
    'better-sqlite3',
    'bcrypt',
    'jsonwebtoken',
    'axios',
    'cors',
    'helmet',
    'cookie-parser',
    'dotenv',
    'pino',
    'pino-pretty',
    'qrcode',
    'qrcode-terminal',
    'zod',
    'express-rate-limit',
  ],
  minify: false,
  keepNames: true,
};

// Build main application
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

// Build migration script
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/database/migrate.ts'],
  outfile: 'dist/database/migrate.js',
});

// Build seed script
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/database/seed.ts'],
  outfile: 'dist/database/seed.js',
});

// Build scripts (e.g., optional scripts/migrate-phone-hashes.ts)
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['scripts/migrate-phone-hashes.ts'],
  outfile: 'dist/scripts/migrate-phone-hashes.js',
});

console.log('✅ Build complete!');
