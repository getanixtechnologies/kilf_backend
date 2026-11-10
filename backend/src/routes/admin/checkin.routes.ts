import { Router } from 'express';
import * as checkinController from '../../controllers/checkin.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { checkInTicketSchema, verifyTicketSchema } from '../../validators/checkin.validator';

const router = Router();

// Checkers (SCANNER) and admins both reach these routes.
router.use(authenticate);

/**
 * @openapi
 * /api/admin/tickets/number-format:
 *   get:
 *     tags: [Admin Check-in]
 *     summary: Fixed prefix of ticket numbers (e.g. LF-2026-) for manual entry
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Prefix and number of suffix digits }
 */
router.get('/number-format', checkinController.numberFormat);

/**
 * @openapi
 * /api/admin/tickets/verify:
 *   post:
 *     tags: [Admin Check-in]
 *     summary: Verify a ticket QR code / ticket number
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ticketNumber]
 *             properties:
 *               ticketNumber: { type: string, example: "LF-2026-000123" }
 *     responses:
 *       200: { description: Verification result }
 */
router.post('/verify', validate(verifyTicketSchema), checkinController.verify);

/**
 * @openapi
 * /api/admin/tickets/check-in:
 *   post:
 *     tags: [Admin Check-in]
 *     summary: Check in an attendee by ticket number
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Attendee checked in }
 */
router.post('/check-in', validate(checkInTicketSchema), checkinController.checkIn);

export default router;
