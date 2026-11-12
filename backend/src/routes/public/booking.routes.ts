import { Router } from 'express';
import * as bookingController from '../../controllers/booking.controller';
import { validate } from '../../middleware/validate';
import { bookingLimiter } from '../../middleware/rateLimiters';
import { optionalGuest } from '../../middleware/guestAuth';
import {
  confirmPaymentSchema,
  createBookingSchema,
  publicBookingLookupSchema,
  bookingQuoteSchema,
} from '../../validators/booking.validator';

const router = Router();

/**
 * @openapi
 * /api/bookings:
 *   post:
 *     tags: [Public Bookings]
 *     summary: Create a ticket booking
 *     description: Guest token optional. With a valid guest Bearer token the booking is linked to that guest account (never from the body). A sent but invalid/expired token returns 401.
 *     security: [{}, { bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ticketId, customer]
 *             properties:
 *               ticketId: { type: string, format: uuid }
 *               quantity: { type: integer, minimum: 1 }
 *               customer:
 *                 type: object
 *                 required: [name, email]
 *                 properties:
 *                   name: { type: string }
 *                   email: { type: string, format: email }
 *                   phone: { type: string, nullable: true, description: Optional (min 6 chars when given) }
 *     responses:
 *       201: { description: Booking created }
 *       401: { description: Guest token sent but invalid or expired }
 *       409: { description: Not enough tickets available }
 */
router.post('/', bookingLimiter, optionalGuest, validate(createBookingSchema), bookingController.create);

/**
 * @openapi
 * /api/bookings/quote:
 *   post:
 *     tags: [Public Bookings]
 *     summary: Calculate the price for a quantity of a ticket (subtotal, GST, total)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ticketId, quantity]
 *             properties:
 *               ticketId: { type: string, format: uuid }
 *               quantity: { type: integer, minimum: 1, maximum: 20 }
 *     responses:
 *       200: { description: Price calculated }
 *       404: { description: Ticket not found }
 */
router.post('/quote', validate(bookingQuoteSchema), bookingController.quote);

/**
 * @openapi
 * /api/bookings/{bookingNumber}/confirm-payment:
 *   post:
 *     tags: [Public Bookings]
 *     summary: Re-verify payment status with the payment provider (backend-authoritative)
 *     responses:
 *       200: { description: Payment status verified }
 */
router.post(
  '/:bookingNumber/confirm-payment',
  bookingLimiter,
  validate(confirmPaymentSchema),
  bookingController.confirmPayment
);

/**
 * @openapi
 * /api/bookings/{bookingNumber}:
 *   get:
 *     tags: [Public Bookings]
 *     summary: Look up a booking by number (requires matching customer email)
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Booking fetched }
 *       404: { description: Booking not found }
 */
router.get('/:bookingNumber', validate(publicBookingLookupSchema), bookingController.lookupByNumber);

export default router;
