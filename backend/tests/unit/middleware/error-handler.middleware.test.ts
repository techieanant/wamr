import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
} from '../../../src/api/middleware/error-handler.middleware';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger, generateRequestId } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/config/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
  generateRequestId: vi.fn(),
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      method: 'GET',
      path: '/api/test',
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();

    (generateRequestId as Mock).mockReturnValue('test-request-id-123');
  });

  describe('AppError', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError(400, 'BAD_REQUEST', 'Invalid input', { field: 'name' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'name' });
    });

    it('should capture stack trace', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Server error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError correctly', () => {
      const appError = new AppError(400, 'BAD_REQUEST', 'Invalid input', { field: 'name' });

      errorHandler(appError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(generateRequestId).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        {
          requestId: 'test-request-id-123',
          method: 'GET',
          path: '/api/test',
          error: {
            name: 'AppError',
            message: 'Invalid input',
            stack: expect.any(String),
          },
        },
        'Application error'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid input',
        code: 'BAD_REQUEST',
        details: { field: 'name' },
        requestId: 'test-request-id-123',
      });
    });

    it('should handle ZodError correctly', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        },
      ]);

      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        {
          requestId: 'test-request-id-123',
          method: 'GET',
          path: '/api/test',
          error: {
            name: 'ZodError',
            message: expect.any(String),
            stack: expect.any(String),
          },
          errors: [
            {
              field: 'name',
              message: 'Expected string, received number',
            },
          ],
        },
        'Validation error'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'name',
            message: 'Expected string, received number',
          },
        ],
        requestId: 'test-request-id-123',
      });
    });

    it('should handle unknown errors correctly', () => {
      const unknownError = new Error('Something went wrong');

      errorHandler(unknownError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        {
          requestId: 'test-request-id-123',
          method: 'GET',
          path: '/api/test',
          error: {
            name: 'Error',
            message: 'Something went wrong',
            stack: expect.any(String),
          },
        },
        'Unhandled error'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        requestId: 'test-request-id-123',
      });
    });

    it('should handle errors without stack trace', () => {
      const errorWithoutStack = new Error('No stack');
      errorWithoutStack.stack = undefined;

      errorHandler(errorWithoutStack, mockRequest as Request, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        {
          requestId: 'test-request-id-123',
          method: 'GET',
          path: '/api/test',
          error: {
            name: 'Error',
            message: 'No stack',
            stack: undefined,
          },
        },
        'Unhandled error'
      );
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 for not found routes', () => {
      const request = { method: 'POST', path: '/api/nonexistent' };

      notFoundHandler(request as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Route POST /api/nonexistent not found',
        code: 'NOT_FOUND',
      });
    });

    it('should handle different HTTP methods', () => {
      const request = { method: 'PUT', path: '/api/test' };

      notFoundHandler(request as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Route PUT /api/test not found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('asyncHandler', () => {
    it('should call the async function and resolve successfully', async () => {
      const asyncFn = vi.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(asyncFn);

      await handler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
    });

    it('should catch and pass errors to next', () => {
      const testError = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(testError);
      const handler = asyncHandler(asyncFn);

      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Since the promise rejection is handled asynchronously,
      // we need to wait for it
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
          expect(mockNext).toHaveBeenCalledWith(testError);
          resolve(void 0);
        }, 10);
      });
    });

    it('should handle AppError rejections', () => {
      const appError = new AppError(403, 'FORBIDDEN', 'Access denied');
      const asyncFn = vi.fn().mockRejectedValue(appError);
      const handler = asyncHandler(asyncFn);

      handler(mockRequest as Request, mockResponse as Response, mockNext);

      // Wait for the promise to resolve
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(mockNext).toHaveBeenCalledWith(appError);
          resolve(void 0);
        }, 10);
      });
    });
  });
});
