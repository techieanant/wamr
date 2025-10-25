import { Router } from 'express';
import * as whatsappController from '../controllers/whatsapp.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All WhatsApp routes require authentication
router.use(authMiddleware);

/**
 * GET /api/whatsapp/status
 * Get current WhatsApp connection status
 */
router.get('/status', whatsappController.getStatus);

/**
 * POST /api/whatsapp/connect
 * Start WhatsApp connection (will emit QR code via WebSocket)
 */
router.post('/connect', whatsappController.connect);

/**
 * POST /api/whatsapp/disconnect
 * Disconnect from WhatsApp
 */
router.post('/disconnect', whatsappController.disconnect);

/**
 * POST /api/whatsapp/restart
 * Restart WhatsApp connection
 */
router.post('/restart', whatsappController.restart);

/**
 * PUT /api/whatsapp/filter
 * Update message filter configuration
 */
router.put('/filter', whatsappController.updateMessageFilter);

/**
 * PUT /api/whatsapp/auto-approval
 * Update auto-approval mode
 */
router.put('/auto-approval', whatsappController.updateAutoApprovalMode);

export default router;
