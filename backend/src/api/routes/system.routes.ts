import { Router } from 'express';
import { getSystemInfo } from '../controllers/system.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Get system information
router.get('/info', authMiddleware, getSystemInfo);

export default router;
