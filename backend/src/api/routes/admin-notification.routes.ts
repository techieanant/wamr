import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  getAdminNotificationConfig,
  setAdminNotificationPhone,
  setAdminNotificationEnabled,
  sendTestNotification,
} from '../controllers/admin-notification.controller.js';

const router = Router();

/**
 * All admin notification routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/admin-notifications/config
 * Get admin notification configuration
 */
router.get('/config', getAdminNotificationConfig);

/**
 * PUT /api/admin-notifications/phone
 * Set admin notification phone number
 */
router.put('/phone', setAdminNotificationPhone);

/**
 * PUT /api/admin-notifications/enabled
 * Enable or disable admin notifications
 */
router.put('/enabled', setAdminNotificationEnabled);

/**
 * POST /api/admin-notifications/test
 * Send test notification to admin
 */
router.post('/test', sendTestNotification);

export default router;
