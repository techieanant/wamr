import { beforeAll, afterAll, vi } from 'vitest';

// Mock logger before importing anything that uses it
vi.mock('../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Mock environment config
vi.mock('../src/config/environment', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    DATABASE_URL: ':memory:',
    CORS_ORIGIN: 'http://localhost:3000',
    PORT: 3001,
    LOG_LEVEL: 'info',
    WHATSAPP_SESSION_PATH: './.wwebjs_auth',
    MEDIA_MONITORING_INTERVAL_MS: 300000,
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64 hex chars = 32 bytes
  },
}));

// Mock external dependencies
vi.mock('@whiskeysockets/baileys', () => {
  const mockSocket = {
    ev: {
      on: vi.fn(),
    },
    sendMessage: vi.fn(),
    end: vi.fn(),
    user: { id: '1234567890:0@s.whatsapp.net' },
  };

  return {
    default: vi.fn(() => mockSocket),
    makeWASocket: vi.fn(() => mockSocket),
    useMultiFileAuthState: vi.fn().mockResolvedValue({
      state: {
        creds: {},
        keys: {},
      },
      saveCreds: vi.fn(),
    }),
    DisconnectReason: {
      loggedOut: 401,
      connectionClosed: 428,
      connectionLost: 408,
      connectionReplaced: 440,
      timedOut: 408,
      restartRequired: 515,
      badSession: 500,
    },
    jidDecode: vi.fn((jid) => {
      if (!jid) return null;
      const parts = jid.split('@')[0].split(':');
      return { user: parts[0], server: 's.whatsapp.net' };
    }),
    proto: {
      IMessageKey: {},
      IMessage: {},
    },
  };
});

vi.mock('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    output: { statusCode: number };
    constructor(message?: string, options?: { statusCode?: number }) {
      super(message);
      this.output = { statusCode: options?.statusCode || 500 };
    }
  },
}));

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('mock-qr-code'),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn(),
};

vi.mock('../src/db', () => ({
  db: mockDb,
  closeDatabaseConnection: vi.fn(),
}));

// Global test setup
beforeAll(() => {
  // Any global setup
});

afterAll(() => {
  // Any global cleanup
});
