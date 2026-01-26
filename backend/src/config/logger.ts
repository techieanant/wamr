import pino from 'pino';
import { env } from './environment';

// Sensitive fields to redact from logs
const redactPaths = [
  'apiKey',
  'api_key',
  'apiKeyEncrypted',
  'password',
  'passwordHash',
  'password_hash',
  'phoneNumber',
  'phone_number',
  'phoneNumberHash',
  'token',
  'authorization',
  'cookie',
  'secret',
  'encryptionKey',
  'jwtSecret',
  '*.apiKey',
  '*.password',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
];

// Error serializer that handles both Error objects and unknown types
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: serializeError(error.cause) } : {}),
    };
  }
  if (error && typeof error === 'object') {
    // Try to extract useful info from non-Error objects
    const obj = error as Record<string, unknown>;
    return {
      type: 'Object',
      message: obj.message || obj.msg || String(error),
      ...obj,
    };
  }
  return { type: typeof error, message: String(error) };
}

// Create logger instance
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    // Also serialize 'error' key since the codebase uses logger.error({ error }, 'message')
    error: serializeError,
    // Serialize 'reason' key for unhandled promise rejections
    reason: serializeError,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  transport:
    env.LOG_PRETTY && env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Request ID generator
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Child logger with request context
export function createRequestLogger(requestId: string, method: string, path: string) {
  return logger.child({
    requestId,
    method,
    path,
  });
}
