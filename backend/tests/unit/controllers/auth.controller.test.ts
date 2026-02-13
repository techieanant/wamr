import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AuthController } from '../../../src/api/controllers/auth.controller';
import { Request, Response, NextFunction } from 'express';
import { adminUserRepository } from '../../../src/repositories/admin-user.repository';
import { passwordService } from '../../../src/services/auth/password.service';
import { authService } from '../../../src/services/auth/auth.service';
import { rateLimiterService } from '../../../src/services/auth/rate-limiter.service';
import { setupService } from '../../../src/services/setup/setup.service';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/repositories/admin-user.repository', () => ({
  adminUserRepository: {
    findByUsername: vi.fn(),
    create: vi.fn(),
    hasAnyUsers: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../../../src/services/setup/setup.service', () => ({
  setupService: {
    isSetupComplete: vi.fn(),
  },
}));
vi.mock('../../../src/services/auth/password.service', () => ({
  passwordService: {
    hash: vi.fn(),
    verify: vi.fn(),
    validateComplexity: vi.fn(),
  },
}));
vi.mock('../../../src/services/auth/auth.service', () => ({
  authService: {
    generateToken: vi.fn(),
    verifyToken: vi.fn(),
  },
}));
vi.mock('../../../src/services/auth/rate-limiter.service', () => ({
  rateLimiterService: {
    isAllowed: vi.fn(),
    recordAttempt: vi.fn(),
  },
}));
vi.mock('../../../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('AuthController', () => {
  let controller: AuthController;
  let mockRequest: Partial<Request & { ip?: string }>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock<[], void>;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthController();

    mockRequest = {};
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();

    // Default: setup is complete and users exist
    (setupService.isSetupComplete as Mock).mockResolvedValue(true);
    (adminUserRepository.hasAnyUsers as Mock).mockResolvedValue(true);
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const loginData = { username: 'admin', password: 'password123' };
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'hashedpass',
        createdAt: new Date(),
        lastLoginAt: null,
      };
      const mockToken = 'jwt-token';

      mockRequest.body = loginData;
      mockRequest.ip = '127.0.0.1';

      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (adminUserRepository.findByUsername as Mock).mockResolvedValue(mockUser);
      (passwordService.verify as Mock).mockResolvedValue(true);
      (authService.generateToken as Mock).mockReturnValue(mockToken);
      (adminUserRepository.update as Mock).mockResolvedValue(mockUser);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('login:127.0.0.1', 5, 900000);
      expect(adminUserRepository.findByUsername).toHaveBeenCalledWith('admin');
      expect(passwordService.verify).toHaveBeenCalledWith('password123', 'hashedpass');
      expect(authService.generateToken).toHaveBeenCalledWith({
        userId: 1,
        username: 'admin',
      });
      expect(mockResponse.cookie).toHaveBeenCalledWith('wamr-auth-token', mockToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 86400000,
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: { id: 1, username: 'admin' },
          message: 'Login successful',
        },
      });
    });

    it('should return 429 when rate limit exceeded', async () => {
      mockRequest.body = { username: 'admin', password: 'password' };
      mockRequest.ip = '127.0.0.1';

      (rateLimiterService.isAllowed as Mock).mockReturnValue(false);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
      });
    });

    it('should return 401 for non-existent user', async () => {
      mockRequest.body = { username: 'nonexistent', password: 'password' };
      mockRequest.ip = '127.0.0.1';

      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (adminUserRepository.findByUsername as Mock).mockResolvedValue(null);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    });

    it('should return 403 when setup is required', async () => {
      mockRequest.body = { username: 'admin', password: 'password' };
      mockRequest.ip = '127.0.0.1';

      (setupService.isSetupComplete as Mock).mockResolvedValue(false);
      (adminUserRepository.hasAnyUsers as Mock).mockResolvedValue(false);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'SETUP_REQUIRED',
        message: 'Initial setup required. Please complete setup first.',
      });
    });

    it('should return 401 for invalid password', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'hashedpass',
      };

      mockRequest.body = { username: 'admin', password: 'wrongpassword' };
      mockRequest.ip = '127.0.0.1';

      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (adminUserRepository.findByUsername as Mock).mockResolvedValue(mockUser);
      (passwordService.verify as Mock).mockResolvedValue(false);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    });

    it('should call next with error on exception', async () => {
      const error = new Error('Database error');
      mockRequest.body = { username: 'admin', password: 'password' };

      (setupService.isSetupComplete as Mock).mockRejectedValue(error);

      await controller.login(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockUser = { userId: 1, username: 'admin' };
      (mockRequest as any).user = mockUser;

      await controller.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('wamr-auth-token');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Logout successful' },
      });
    });

    it('should handle logout without user in request', async () => {
      await controller.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('wamr-auth-token');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should call next with error on exception', async () => {
      const error = new Error('Logout error');
      (mockResponse.clearCookie as Mock).mockImplementation(() => {
        throw error;
      });

      await controller.logout(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user successfully', async () => {
      const mockUser = { userId: 1, username: 'admin' };
      const mockAdminUser = {
        id: 1,
        username: 'admin',
        passwordHash: 'hashedpass',
        createdAt: new Date(),
        lastLoginAt: null,
      };

      (mockRequest as any).user = mockUser;
      (adminUserRepository.findById as Mock).mockResolvedValue(mockAdminUser);

      await controller.getCurrentUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(adminUserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: { id: 1, username: 'admin' },
        },
      });
    });

    it('should return 404 when user not found', async () => {
      const mockUser = { userId: 999, username: 'admin' };
      (mockRequest as any).user = mockUser;

      (adminUserRepository.findById as Mock).mockResolvedValue(null);

      await controller.getCurrentUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    });

    it('should call next with error on exception', async () => {
      const error = new Error('Database error');
      const mockUser = { userId: 1, username: 'admin' };
      (mockRequest as any).user = mockUser;

      (adminUserRepository.findById as Mock).mockRejectedValue(error);

      await controller.getCurrentUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
