import { Router } from 'express';
import * as enquiryController from '../../controllers/enquiry.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  enquiryIdParamSchema,
  listEnquiriesSchema,
  updateEnquiryStatusSchema,
} from '../../validators/enquiry.validator';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/admin/enquiries:
 *   get:
 *     tags: [Admin Enquiries]
 *     summary: List enquiries
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Paginated enquiries }
 */
router.get('/', validate(listEnquiriesSchema), enquiryController.list);

/**
 * @openapi
 * /api/admin/enquiries/{id}:
 *   get:
 *     tags: [Admin Enquiries]
 *     summary: Get an enquiry
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Enquiry }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Admin Enquiries]
 *     summary: Delete an enquiry
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Deleted }
 */
router.get('/:id', validate(enquiryIdParamSchema), enquiryController.getOne);
router.delete('/:id', authorize('SUPER_ADMIN'), validate(enquiryIdParamSchema), enquiryController.remove);

/**
 * @openapi
 * /api/admin/enquiries/{id}/status:
 *   patch:
 *     tags: [Admin Enquiries]
 *     summary: Update enquiry status
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, IN_PROGRESS, RESOLVED] }
 *     responses:
 *       200: { description: Updated }
 */
router.patch(
  '/:id/status',
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(updateEnquiryStatusSchema),
  enquiryController.updateStatus
);

export default router;
