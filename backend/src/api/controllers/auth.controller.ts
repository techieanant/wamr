import type { Request, Response, NextFunction } from 'express';
import { adminUserRepository } from '../../repositories/admin-user.repository.js';
import { passwordService } from '../../services/auth/password.service.js';
import { authService } from '../../services/auth/auth.service.js';
import { rateLimiterService } from '../../services/auth/rate-limiter.service.js';
import type { JWTPayload } from '../../types/auth.types.js';
import { logger } from '../../config/logger.js';

export class AuthController {
  /**
   * Login endpoint
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body;
      const clientIp = req.ip || 'unknown';

      // Rate limiting check
      const rateLimitKey = `login:${clientIp}`;
      if (!rateLimiterService.isAllowed(rateLimitKey, 5, 15 * 60 * 1000)) {
        logger.warn({ username, ip: clientIp }, 'Login rate limit exceeded');
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please try again later.',
        });
        return;
      }

      // Find user
      const user = await adminUserRepository.findByUsername(username);
      if (!user) {
        logger.warn({ username, ip: clientIp }, 'Login failed - user not found');
        res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        });
        return;
      }

      // Verify password
      const isValid = await passwordService.verify(password, user.passwordHash);
      if (!isValid) {
        logger.warn({ username, ip: clientIp }, 'Login failed - invalid password');
        res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        });
        return;
      }

      // Update last login
      await adminUserRepository.update(user.id, {
        lastLoginAt: new Date(),
      });

      // Generate JWT
      const token = authService.generateToken({
        userId: user.id,
        username: user.username,
      });

      // Set HTTP-only cookie (24-hour expiry)
      res.cookie('wamr-auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      logger.info({ username, userId: user.id, ip: clientIp }, 'User logged in');

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
          },
          message: 'Login successful',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout endpoint
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Clear auth cookie
      res.clearCookie('wamr-auth-token');

      const user = (req as any).user as JWTPayload | undefined;
      if (user) {
        logger.info({ username: user.username, userId: user.userId }, 'User logged out');
      }

      res.status(200).json({
        success: true,
        data: {
          message: 'Logout successful',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user
   * GET /api/auth/me
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload;

      const adminUser = await adminUserRepository.findById(user.userId);
      if (!adminUser) {
        res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: adminUser.id,
            username: adminUser.username,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
