import { Request, Response, NextFunction } from 'express';
import { ErrorCodes, HttpStatus } from '../../utils/error-codes';
import { logger, generateRequestId } from '../../config/logger';
import { ZodError } from 'zod';

/**
 * Custom application error
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 * Catches all errors and formats consistent error responses
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Generate request ID for tracking
  const requestId = generateRequestId();

  // Log error with context
  const errorContext = {
    requestId,
    method: req.method,
    path: req.path,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };

  // Handle known AppError
  if (error instanceof AppError) {
    logger.warn(errorContext, 'Application error');

    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
      requestId,
    });
    return;
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const errors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    logger.warn({ ...errorContext, errors }, 'Validation error');

    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      error: 'Validation failed',
      code: ErrorCodes.VALIDATION_ERROR,
      details: errors,
      requestId,
    });
    return;
  }

  // Handle unknown errors
  logger.error(errorContext, 'Unhandled error');

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    error: 'Internal server error',
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
    requestId,
  });
}

/**
 * Not found handler (404)
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(HttpStatus.NOT_FOUND).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: ErrorCodes.NOT_FOUND,
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
