import { Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth/auth.service';
import { ErrorCodes, HttpStatus } from '../../utils/error-codes';
import { logger } from '../../config/logger';

/**
 * Extend Express Request to include authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
  };
}

/**
 * JWT authentication middleware
 * Validates JWT token from cookie and attaches user to request
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    // Get token from cookie
    const token = req.cookies['wamr-auth-token'];

    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Authentication required',
        code: ErrorCodes.UNAUTHORIZED,
      });
      return;
    }

    // Verify token
    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Invalid or expired token',
        code: ErrorCodes.INVALID_TOKEN,
      });
      return;
    }

    // Attach user to request
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  } catch (error) {
    logger.error({ error }, 'Authentication middleware error');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Authentication failed',
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if token exists, but doesn't fail if missing
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const token = req.cookies['wamr-auth-token'];

    if (token) {
      const payload = authService.verifyToken(token);
      if (payload) {
        req.user = {
          userId: payload.userId,
          username: payload.username,
        };
      }
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Optional authentication middleware error');
    next();
  }
}
