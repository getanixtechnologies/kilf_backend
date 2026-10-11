import { Router } from 'express';
import * as enquiryController from '../../controllers/enquiry.controller';
import { validate } from '../../middleware/validate';
import { enquiryLimiter } from '../../middleware/rateLimiters';
import { createEnquirySchema } from '../../validators/enquiry.validator';

const router = Router();

/**
 * @openapi
 * /api/enquiries:
 *   post:
 *     tags: [Enquiries]
 *     summary: Submit an enquiry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, organisation]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string, format: email }
 *               phone: { type: string, example: "+46701234567" }
 *               organisation: { type: string, description: Company or brand }
 *               topic: { type: string, description: Interested in }
 *               notes: { type: string, maxLength: 2000, description: Message }
 *     responses:
 *       201: { description: Enquiry submitted }
 *       400: { description: Validation failed }
 *       429: { description: Too many requests }
 */
router.post('/', enquiryLimiter, validate(createEnquirySchema), enquiryController.create);

export default router;
