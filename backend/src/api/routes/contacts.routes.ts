import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  updateContactQuota,
  deleteContactQuota,
} from '../controllers/contacts.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getAllContacts);
router.get('/:id', getContactById);
router.post('/', createContact);
router.patch('/:id', updateContact);
router.delete('/:id', deleteContact);
router.put('/:id/quota', updateContactQuota);
router.delete('/:id/quota', deleteContactQuota);

export default router;
