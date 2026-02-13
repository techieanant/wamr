import type { Request, Response, NextFunction } from 'express';
import { setupService } from '../../services/setup/setup.service.js';
import { logger } from '../../config/logger.js';

export class SetupController {
  async getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isComplete = await setupService.isSetupComplete();

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.status(200).json({
        success: true,
        data: {
          isComplete,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async completeSetup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Username and password are required',
        });
        return;
      }

      const result = await setupService.createInitialAdmin(username, password);

      logger.info({ userId: result.adminId }, 'Setup completed successfully');

      res.status(201).json({
        success: true,
        data: {
          message: 'Setup completed successfully',
          backupCodes: result.backupCodes,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already been completed')) {
          res.status(403).json({
            success: false,
            code: 'SETUP_ALREADY_COMPLETE',
            message: 'Setup has already been completed',
          });
          return;
        }
        if (error.message.includes('already exists')) {
          res.status(403).json({
            success: false,
            code: 'ADMIN_EXISTS',
            message: 'An admin user already exists',
          });
          return;
        }
        if (error.message.includes('requirements')) {
          res.status(400).json({
            success: false,
            code: 'INVALID_PASSWORD',
            message: error.message,
          });
          return;
        }
        if (error.message.includes('Username')) {
          res.status(400).json({
            success: false,
            code: 'INVALID_USERNAME',
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }

  async resetPasswordWithBackupCode(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { code, newPassword } = req.body;

      if (!code || !newPassword) {
        res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Backup code and new password are required',
        });
        return;
      }

      const normalizedCode = code.replace(/-/g, '').toUpperCase();

      const success = await setupService.resetPasswordWithBackupCode(normalizedCode, newPassword);

      if (!success) {
        res.status(401).json({
          success: false,
          code: 'INVALID_BACKUP_CODE',
          message: 'Invalid or already used backup code',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'Password reset successful. Please log in with your new password.',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('requirements')) {
        res.status(400).json({
          success: false,
          code: 'INVALID_PASSWORD',
          message: error.message,
        });
        return;
      }
      next(error);
    }
  }

  async getBackupCodesCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await setupService.getBackupCodesCount();

      res.status(200).json({
        success: true,
        data: {
          remainingCodes: count,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async regenerateBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword } = req.body;

      if (!currentPassword) {
        res.status(400).json({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Current password is required',
        });
        return;
      }

      const newCodes = await setupService.regenerateBackupCodes(currentPassword);

      res.status(200).json({
        success: true,
        data: {
          message: 'Backup codes regenerated successfully',
          backupCodes: newCodes,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid current password')) {
          res.status(401).json({
            success: false,
            code: 'INVALID_PASSWORD',
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  }
}

export const setupController = new SetupController();
