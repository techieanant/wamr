import { Router } from 'express';
import {
  listServices,
  getService,
  createService,
  updateService,
  deleteService,
  testConnection,
  getServiceMetadata,
} from '../controllers/services.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  createServiceConfigSchema,
  updateServiceConfigSchema,
  testConnectionSchema,
  serviceIdParamSchema,
  getServiceMetadataSchema,
} from '../validators/service.validators.js';

const router = Router();

/**
 * All service routes require authentication
 */
router.use(authMiddleware);

/**
 * GET /api/services
 * List all service configurations
 */
router.get('/', listServices);

/**
 * GET /api/services/:id
 * Get service configuration by ID
 */
router.get('/:id', validate(serviceIdParamSchema, 'params'), getService);

/**
 * POST /api/services
 * Create new service configuration
 */
router.post('/', validate(createServiceConfigSchema, 'body'), createService);

/**
 * PUT /api/services/:id
 * Update service configuration
 */
router.put(
  '/:id',
  validate(serviceIdParamSchema, 'params'),
  validate(updateServiceConfigSchema, 'body'),
  updateService
);

/**
 * DELETE /api/services/:id
 * Delete service configuration
 */
router.delete('/:id', validate(serviceIdParamSchema, 'params'), deleteService);

/**
 * POST /api/services/test-connection
 * Test connection to service without saving
 */
router.post('/test-connection', validate(testConnectionSchema, 'body'), testConnection);

/**
 * POST /api/services/metadata
 * Get service metadata (quality profiles, root folders, servers)
 */
router.post('/metadata', validate(getServiceMetadataSchema, 'body'), getServiceMetadata);

export default router;
