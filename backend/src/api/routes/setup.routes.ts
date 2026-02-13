import { Router } from 'express';
import { setupController } from '../controllers/setup.controller.js';

const router = Router();

router.get('/status', setupController.getStatus.bind(setupController));
router.post('/', setupController.completeSetup.bind(setupController));
router.get('/backup-codes/count', setupController.getBackupCodesCount.bind(setupController));
router.post(
  '/backup-codes/regenerate',
  setupController.regenerateBackupCodes.bind(setupController)
);
router.post('/reset-password', setupController.resetPasswordWithBackupCode.bind(setupController));

export default router;
