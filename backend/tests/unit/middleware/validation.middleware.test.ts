import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { validate, validateMultiple } from '../../../src/api/middleware/validation.middleware';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/config/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
      query: {},
      params: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('validate', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    it('should validate body successfully and call next', async () => {
      const validData = { name: 'John', age: 25 };
      mockRequest.body = validData;

      const middleware = validate(testSchema, 'body');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual(validData);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate query successfully and call next', async () => {
      const validData = { name: 'John', age: 25 };
      mockRequest.query = validData as any;

      const middleware = validate(testSchema, 'query');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.query).toEqual(validData);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate params successfully and call next', async () => {
      const validData = { name: 'John', age: 25 };
      mockRequest.params = validData as any;

      const middleware = validate(testSchema, 'params');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.params).toEqual(validData);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 422 for validation errors', async () => {
      const invalidData = { name: '', age: -1 };
      mockRequest.body = invalidData;

      const middleware = validate(testSchema, 'body');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [
          { field: 'name', message: 'String must contain at least 1 character(s)' },
          { field: 'age', message: 'Number must be greater than or equal to 0' },
        ],
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        {
          errors: [
            { field: 'name', message: 'String must contain at least 1 character(s)' },
            { field: 'age', message: 'Number must be greater than or equal to 0' },
          ],
          target: 'body',
        },
        'Validation failed'
      );
    });

    it('should return 500 for unexpected errors', async () => {
      const errorSchema = z.object({
        test: z.string().transform(() => {
          throw new Error('Transform error');
        }),
      });

      mockRequest.body = { test: 'value' };

      const middleware = validate(errorSchema, 'body');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation error',
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(logger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Validation middleware error'
      );
    });

    it('should default to body validation when no target specified', async () => {
      const validData = { name: 'John', age: 25 };
      mockRequest.body = validData;

      const middleware = validate(testSchema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual(validData);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateMultiple', () => {
    const bodySchema = z.object({
      name: z.string().min(1),
    });

    const querySchema = z.object({
      limit: z.number().min(1).max(100),
    });

    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    it('should validate all targets successfully and call next', async () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { limit: 10 } as any;
      mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: 'John' });
      expect(mockRequest.query).toEqual({ limit: 10 });
      expect(mockRequest.params).toEqual({ id: '123e4567-e89b-12d3-a456-426614174000' });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should validate only specified targets', async () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { limit: 10 } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: 'John' });
      expect(mockRequest.query).toEqual({ limit: 10 });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 422 when body validation fails', async () => {
      mockRequest.body = { name: '' };
      mockRequest.query = { limit: 10 } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'body.name', message: 'String must contain at least 1 character(s)' }],
      });
      expect(logger.warn).toHaveBeenCalledWith(
        {
          errors: [{ field: 'body.name', message: 'String must contain at least 1 character(s)' }],
        },
        'Multi-target validation failed'
      );
    });

    it('should return 422 when query validation fails', async () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { limit: 0 } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'query.limit', message: 'Number must be greater than or equal to 1' }],
      });
    });

    it('should collect errors from multiple targets', async () => {
      mockRequest.body = { name: '' };
      mockRequest.query = { limit: 200 } as any;
      mockRequest.params = { id: 'invalid' } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          { field: 'body.name', message: 'String must contain at least 1 character(s)' },
          { field: 'query.limit', message: 'Number must be less than or equal to 100' },
          { field: 'params.id', message: 'Invalid uuid' },
        ]),
      });
    });

    it('should validate only specified targets', async () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { limit: 10 };

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({ name: 'John' });
      expect(mockRequest.query).toEqual({ limit: 10 });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 422 when body validation fails', async () => {
      mockRequest.body = { name: '' };
      mockRequest.query = { limit: 10 };

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'body.name', message: 'String must contain at least 1 character(s)' }],
      });
      expect(logger.warn).toHaveBeenCalledWith(
        {
          errors: [{ field: 'body.name', message: 'String must contain at least 1 character(s)' }],
        },
        'Multi-target validation failed'
      );
    });

    it('should return 422 when query validation fails', async () => {
      mockRequest.body = { name: 'John' };
      mockRequest.query = { limit: 0 } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'query.limit', message: 'Number must be greater than or equal to 1' }],
      });
    });

    it('should return 422 when params validation fails', async () => {
      mockRequest.params = { id: 'invalid-uuid' } as any;

      const middleware = validateMultiple({
        params: paramsSchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'params.id', message: 'Invalid uuid' }],
      });
    });

    it('should collect errors from multiple targets', async () => {
      mockRequest.body = { name: '' };
      mockRequest.query = { limit: 200 } as any;
      mockRequest.params = { id: 'invalid' } as any;

      const middleware = validateMultiple({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          { field: 'body.name', message: 'String must contain at least 1 character(s)' },
          { field: 'query.limit', message: 'Number must be less than or equal to 100' },
          { field: 'params.id', message: 'Invalid uuid' },
        ]),
      });
    });
  });
});
