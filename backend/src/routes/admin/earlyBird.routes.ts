import { Router } from 'express';
import * as earlyBirdController from '../../controllers/earlyBird.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { earlyBirdIdParamSchema, exportEarlyBirdSchema, listEarlyBirdSchema } from '../../validators/earlyBird.validator';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/admin/early-bird:
 *   get:
 *     tags: [Admin Early Bird]
 *     summary: List early bird registrations
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Paginated registrations }
 */
router.get('/', validate(listEarlyBirdSchema), earlyBirdController.list);

/**
 * @openapi
 * /api/admin/early-bird/export:
 *   get:
 *     tags: [Admin Early Bird]
 *     summary: Export early bird registrations as CSV
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: CSV file }
 */
router.get('/export', validate(exportEarlyBirdSchema), earlyBirdController.exportCsv);

/**
 * @openapi
 * /api/admin/early-bird/{id}:
 *   delete:
 *     tags: [Admin Early Bird]
 *     summary: Delete an early bird registration
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/:id', authorize('SUPER_ADMIN'), validate(earlyBirdIdParamSchema), earlyBirdController.remove);

export default router;
