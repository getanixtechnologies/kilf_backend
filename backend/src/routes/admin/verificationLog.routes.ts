import { Router } from 'express';
import * as checkinController from '../../controllers/checkin.controller';
import { authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listVerificationLogsSchema } from '../../validators/checkin.validator';

const router = Router();

router.use(authorize('SUPER_ADMIN', 'ADMIN'));

/**
 * @openapi
 * /api/admin/verification-logs:
 *   get:
 *     tags: [Admin Check-in]
 *     summary: Every ticket verification and check-in attempt, newest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: adminId, schema: { type: string } }
 *       - { in: query, name: method, schema: { type: string, enum: [QR, MANUAL] } }
 *       - { in: query, name: action, schema: { type: string, enum: [VERIFY, CHECK_IN] } }
 *       - { in: query, name: outcome, schema: { type: string, enum: [VALID, CHECKED_IN, DUPLICATE, NOT_FOUND, INVALID] } }
 *     responses:
 *       200: { description: Paginated verification log }
 */
router.get('/', validate(listVerificationLogsSchema), checkinController.listVerificationLogs);

export default router;
