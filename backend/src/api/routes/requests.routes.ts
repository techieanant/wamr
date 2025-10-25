import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  getAllRequests,
  getRequestById,
  deleteRequest,
  updateRequestStatus,
  approveRequest,
  rejectRequest,
} from '../controllers/requests.controller.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/requests
 * Get all requests with optional filtering and pagination
 */
router.get('/', getAllRequests);

/**
 * GET /api/requests/:id
 * Get a specific request by ID
 */
router.get('/:id', getRequestById);

/**
 * DELETE /api/requests/:id
 * Delete a request
 */
router.delete('/:id', deleteRequest);

/**
 * PATCH /api/requests/:id/status
 * Update request status
 */
router.patch('/:id/status', updateRequestStatus);

/**
 * POST /api/requests/:id/approve
 * Approve a pending request and submit to service
 */
router.post('/:id/approve', approveRequest);

/**
 * POST /api/requests/:id/reject
 * Reject a pending request with optional reason
 */
router.post('/:id/reject', rejectRequest);

export default router;
