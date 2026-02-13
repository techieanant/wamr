import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { SetupController } from '../../../src/api/controllers/setup.controller';
import { Request, Response, NextFunction } from 'express';
import { setupService } from '../../../src/services/setup/setup.service';
import { logger } from '../../../src/config/logger';

// Mock dependencies
vi.mock('../../../src/services/setup/setup.service', () => ({
  setupService: {
    isSetupComplete: vi.fn(),
    createInitialAdmin: vi.fn(),
    resetPasswordWithBackupCode: vi.fn(),
  },
}));

vi.mock('../../../src/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('SetupController', () => {
  let controller: SetupController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SetupController();

    mockRequest = {};
    mockResponse = {
      set: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('getStatus', () => {
    it('should return setup status', async () => {
      (setupService.isSetupComplete as Mock).mockResolvedValue(true);

      await controller.getStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          isComplete: true,
        },
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Database error');
      (setupService.isSetupComplete as Mock).mockRejectedValue(error);

      await controller.getStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('completeSetup', () => {
    it('should complete setup successfully', async () => {
      const setupData = { username: 'admin', password: 'Password123!' };
      const mockResult = {
        adminId: 1,
        backupCodes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5'],
      };

      mockRequest.body = setupData;
      (setupService.createInitialAdmin as Mock).mockResolvedValue(mockResult);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(setupService.createInitialAdmin).toHaveBeenCalledWith(
        'admin',
        'Password123!'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Setup completed successfully',
          backupCodes: mockResult.backupCodes,
        },
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should return 400 when username or password is missing', async () => {
      mockRequest.body = { username: 'admin' };

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Username and password are required',
      });
    });

    it('should return 403 when setup is already complete', async () => {
      const error = new Error('Setup has already been completed');
      mockRequest.body = { username: 'admin', password: 'Password123!' };
      (setupService.createInitialAdmin as Mock).mockRejectedValue(error);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'SETUP_ALREADY_COMPLETE',
        message: 'Setup has already been completed',
      });
    });

    it('should return 403 when admin already exists', async () => {
      const error = new Error('Admin user already exists');
      mockRequest.body = { username: 'admin', password: 'Password123!' };
      (setupService.createInitialAdmin as Mock).mockRejectedValue(error);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'ADMIN_EXISTS',
        message: 'An admin user already exists',
      });
    });

    it('should return 400 when password does not meet requirements', async () => {
      const error = new Error(
        'Password does not meet requirements: Password too weak'
      );
      mockRequest.body = { username: 'admin', password: 'weak' };
      (setupService.createInitialAdmin as Mock).mockRejectedValue(error);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_PASSWORD',
        message: error.message,
      });
    });

    it('should return 400 when username is invalid', async () => {
      const error = new Error('Username must be at least 3 characters');
      mockRequest.body = { username: 'ad', password: 'Password123!' };
      (setupService.createInitialAdmin as Mock).mockRejectedValue(error);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_USERNAME',
        message: error.message,
      });
    });

    it('should call next on unexpected error', async () => {
      const error = new Error('Unexpected error');
      mockRequest.body = { username: 'admin', password: 'Password123!' };
      (setupService.createInitialAdmin as Mock).mockRejectedValue(error);

      await controller.completeSetup(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('resetPasswordWithBackupCode', () => {
    it('should reset password successfully', async () => {
      mockRequest.body = {
        code: 'ABCD-EFGH-IJ',
        newPassword: 'NewPassword123!',
      };
      (setupService.resetPasswordWithBackupCode as Mock).mockResolvedValue(
        true
      );

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(setupService.resetPasswordWithBackupCode).toHaveBeenCalledWith(
        'ABCDEFGHIJ',
        'NewPassword123!'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          message:
            'Password reset successful. Please log in with your new password.',
        },
      });
    });

    it('should return 400 when code or newPassword is missing', async () => {
      mockRequest.body = { code: 'ABCD-EFGH-IJ' };

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'Backup code and new password are required',
      });
    });

    it('should return 401 for invalid backup code', async () => {
      mockRequest.body = {
        code: 'INVALID-CODE',
        newPassword: 'NewPassword123!',
      };
      (setupService.resetPasswordWithBackupCode as Mock).mockResolvedValue(
        false
      );

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_BACKUP_CODE',
        message: 'Invalid or already used backup code',
      });
    });

    it('should return 400 when new password does not meet requirements', async () => {
      const error = new Error(
        'Password does not meet requirements: Password too weak'
      );
      mockRequest.body = {
        code: 'ABCD-EFGH-IJ',
        newPassword: 'weak',
      };
      (setupService.resetPasswordWithBackupCode as Mock).mockRejectedValue(
        error
      );

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_PASSWORD',
        message: error.message,
      });
    });

    it('should call next on unexpected error', async () => {
      const error = new Error('Unexpected error');
      mockRequest.body = {
        code: 'ABCD-EFGH-IJ',
        newPassword: 'NewPassword123!',
      };
      (setupService.resetPasswordWithBackupCode as Mock).mockRejectedValue(
        error
      );

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should normalize backup code by removing dashes and converting to uppercase', async () => {
      mockRequest.body = {
        code: 'abcd-efgh-ij',
        newPassword: 'NewPassword123!',
      };
      (setupService.resetPasswordWithBackupCode as Mock).mockResolvedValue(
        true
      );

      await controller.resetPasswordWithBackupCode(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(setupService.resetPasswordWithBackupCode).toHaveBeenCalledWith(
        'ABCDEFGHIJ',
        'NewPassword123!'
      );
    });
  });
});
