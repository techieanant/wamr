import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  changePassword,
  exportData,
  importData,
  getSettings,
  updateSetting,
} from '../controllers/settings.controller';

const router = Router();

/**
 * All settings routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/settings
 * Get all settings
 */
router.get('/', getSettings);

/**
 * PUT /api/settings/:key
 * Update a setting
 */
router.put('/:key', updateSetting);

/**
 * POST /api/settings/change-password
 * Change admin password
 */
router.post('/change-password', changePassword);

/**
 * GET /api/settings/export
 * Export all data
 */
router.get('/export', exportData);

/**
 * POST /api/settings/import
 * Import data from exported JSON
 */
router.post('/import', importData);

export default router;
