import { Router } from 'express';
import * as scannerController from '../../controllers/scanner.controller';
import { authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createScannerSchema, scannerIdSchema, updateScannerSchema } from '../../validators/scanner.validator';

const router = Router();

// Admins manage checker (gate staff, role SCANNER) accounts.
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

/**
 * @openapi
 * /api/admin/scanners:
 *   get:
 *     tags: [Admin Checkers]
 *     summary: List checker (gate staff) accounts
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of checkers }
 *   post:
 *     tags: [Admin Checkers]
 *     summary: Create a checker account and email its temporary password
 *     description: Omit password to generate one. The checker must change it at first login.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Checker created }
 */
router.get('/', scannerController.list);
router.post('/', validate(createScannerSchema), scannerController.create);

/**
 * @openapi
 * /api/admin/scanners/{id}/resend-credentials:
 *   post:
 *     tags: [Admin Checkers]
 *     summary: Reset a checker password to a new temporary one and email it
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Credentials reissued }
 */
router.post('/:id/resend-credentials', validate(scannerIdSchema), scannerController.resendCredentials);

/**
 * @openapi
 * /api/admin/scanners/{id}:
 *   patch:
 *     tags: [Admin Checkers]
 *     summary: Rename, deactivate/reactivate or reset the password of a checker
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Checker updated }
 */
router.patch('/:id', validate(updateScannerSchema), scannerController.update);

export default router;
