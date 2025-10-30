/**
 * Frontend Logger Configuration
 *
 * Uses loglevel for structured logging across the frontend application.
 * Provides consistent logging interface with level management.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.debug('Debug message', { data });
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 *
 * @module lib/logger
 */

import log from 'loglevel';

// Configure log level based on environment
const isDevelopment = import.meta.env.DEV;
const defaultLevel = isDevelopment ? log.levels.DEBUG : log.levels.WARN;

// Set default level
log.setDefaultLevel(defaultLevel);

// Create styled prefix for logs
const originalFactory = log.methodFactory;
log.methodFactory = function (
  methodName: log.LogLevelNames,
  logLevel: log.LogLevelNumbers,
  loggerName: string | symbol
) {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);

  return function (...args: unknown[]) {
    // Add emoji prefix based on log level
    const prefixes: Record<string, string> = {
      trace: '🔍',
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };

    const prefix = prefixes[methodName] || '';
    const timestamp = new Date().toLocaleTimeString();

    // Add timestamp and emoji in development
    if (isDevelopment) {
      rawMethod(`[${timestamp}] ${prefix}`, ...args);
    } else {
      rawMethod(...args);
    }
  };
};

// Apply the plugin
log.rebuild();

// Export the logger
export const logger = log;

// Export helper to create named loggers for specific modules
export function createLogger(name: string) {
  const namedLogger = log.getLogger(name);
  namedLogger.setDefaultLevel(defaultLevel);

  // Apply same styling to named loggers
  const originalNamedFactory = namedLogger.methodFactory;
  namedLogger.methodFactory = function (
    methodName: log.LogLevelNames,
    logLevel: log.LogLevelNumbers
  ) {
    const rawMethod = originalNamedFactory(methodName, logLevel, name);

    return function (...args: unknown[]) {
      const prefixes: Record<string, string> = {
        trace: '🔍',
        debug: '🐛',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      };

      const prefix = prefixes[methodName] || '';
      const timestamp = new Date().toLocaleTimeString();

      if (isDevelopment) {
        rawMethod(`[${timestamp}] ${prefix} [${name}]`, ...args);
      } else {
        rawMethod(`[${name}]`, ...args);
      }
    };
  };

  namedLogger.rebuild();
  return namedLogger;
}
