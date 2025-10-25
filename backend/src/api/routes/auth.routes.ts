import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { loginValidator } from '../validators/auth.validators.js';

const router = Router();

/**
 * POST /api/auth/login
 * Admin login
 */
router.post('/login', validate(loginValidator), (req, res, next) =>
  authController.login(req, res, next)
);

/**
 * POST /api/auth/logout
 * Admin logout (requires authentication)
 */
router.post('/logout', authMiddleware, (req, res, next) => authController.logout(req, res, next));

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authMiddleware, (req, res, next) =>
  authController.getCurrentUser(req, res, next)
);

export default router;
