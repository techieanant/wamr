import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthenticatedRequest,
} from '../../../src/api/middleware/auth.middleware';
import { Request, Response, NextFunction } from 'express';
import { authService } from '../../../src/services/auth/auth.service';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/services/auth/auth.service', () => ({
  authService: {
    verifyToken: vi.fn(),
  },
}));
vi.mock('../../../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      cookies: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('authMiddleware', () => {
    it('should call next when token is valid', () => {
      const token = 'valid-token';
      const payload = { userId: 1, username: 'admin' };

      mockRequest.cookies = { 'wamr-auth-token': token };
      (authService.verifyToken as Mock).mockReturnValue(payload);

      authMiddleware(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRequest.user).toEqual({ userId: 1, username: 'admin' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when no token provided', () => {
      authMiddleware(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', () => {
      const token = 'invalid-token';
      mockRequest.cookies = { 'wamr-auth-token': token };

      (authService.verifyToken as Mock).mockReturnValue(null);

      authMiddleware(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected error', () => {
      const token = 'some-token';
      mockRequest.cookies = { 'wamr-auth-token': token };

      const error = new Error('Unexpected error');
      (authService.verifyToken as Mock).mockImplementation(() => {
        throw error;
      });

      authMiddleware(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith({ error }, 'Authentication middleware error');
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should attach user when valid token provided', () => {
      const token = 'valid-token';
      const payload = { userId: 1, username: 'admin' };

      mockRequest.cookies = { 'wamr-auth-token': token };
      (authService.verifyToken as Mock).mockReturnValue(payload);

      optionalAuthMiddleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual({ userId: 1, username: 'admin' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not attach user when no token provided', () => {
      optionalAuthMiddleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not attach user when token is invalid', () => {
      const token = 'invalid-token';
      mockRequest.cookies = { 'wamr-auth-token': token };

      (authService.verifyToken as Mock).mockReturnValue(null);

      optionalAuthMiddleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue on error', () => {
      const token = 'some-token';
      mockRequest.cookies = { 'wamr-auth-token': token };

      const error = new Error('Verification error');
      (authService.verifyToken as Mock).mockImplementation(() => {
        throw error;
      });

      optionalAuthMiddleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith(
        { error },
        'Optional authentication middleware error'
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
