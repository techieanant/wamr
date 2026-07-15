import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { broadcastController } from '../controllers/broadcast.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/', broadcastController.list);
router.get('/contacts', broadcastController.contacts);
router.get('/export', broadcastController.exportAll);
router.get('/:id', broadcastController.get);
router.post('/', broadcastController.create);
router.post('/:id/cancel', broadcastController.cancel);
router.post('/:id/pause', broadcastController.pause);
router.post('/:id/resume', broadcastController.resume);
router.post('/:id/retry', broadcastController.retryFailed);
router.delete('/:id', broadcastController.delete);

export default router;
