import { Router } from 'express';
import * as guestAuthController from '../../controllers/guestAuth.controller';
import { authenticateGuest } from '../../middleware/guestAuth';
import { validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimiters';
import {
  guestChangePasswordSchema,
  guestForgotPasswordSchema,
  guestLoginSchema,
  guestRefreshSchema,
  guestRegisterSchema,
  guestResetPasswordSchema,
  guestUpdateProfileSchema,
  guestBookingListSchema,
  guestBookingParamsSchema,
} from '../../validators/guestAuth.validator';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Create a guest account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, confirmPassword]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 8, description: Needs upper, lower and a digit }
 *               confirmPassword: { type: string, format: password }
 *     responses:
 *       201: { description: Account created; returns token, refreshToken and guest }
 *       400: { description: Validation failed (e.g. passwords do not match) }
 *       409: { description: Email already registered }
 */
router.post('/register', authLimiter, validate(guestRegisterSchema), guestAuthController.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Guest login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Login successful }
 *       401: { description: Invalid credentials }
 */
router.post('/login', authLimiter, validate(guestLoginSchema), guestAuthController.login);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Exchange a refresh token for a new access token
 *     responses:
 *       200: { description: Token refreshed }
 */
router.post('/refresh', authLimiter, validate(guestRefreshSchema), guestAuthController.refreshToken);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Log out the current guest
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', authenticateGuest, guestAuthController.logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Guest Auth]
 *     summary: Get the current guest's profile (id, name, email, phone, ...)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile fetched }
 *       401: { description: Missing, invalid or expired token }
 *   patch:
 *     tags: [Guest Auth]
 *     summary: Update the current guest's name and phone (email is not editable)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               phone: { type: string, pattern: '^[0-9+ ]{10,15}$', nullable: true }
 *     responses:
 *       200: { description: Profile updated; data is the updated guest }
 *       400: { description: Validation failed }
 *       401: { description: Missing, invalid or expired token }
 */
router.get('/me', authenticateGuest, guestAuthController.me);
router.patch('/me', authenticateGuest, validate(guestUpdateProfileSchema), guestAuthController.updateMe);

/**
 * @openapi
 * /api/auth/bookings:
 *   get:
 *     tags: [Guest Auth]
 *     summary: List the current guest's bookings, newest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200:
 *         description: Bookings fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/GuestBooking' } }
 *       401: { description: Missing, invalid or expired token }
 */
router.get('/bookings', authenticateGuest, validate(guestBookingListSchema), guestAuthController.myBookings);

/**
 * @openapi
 * /api/auth/bookings/{bookingNumber}:
 *   get:
 *     tags: [Guest Auth]
 *     summary: Get one of the current guest's bookings with all its ticket instances
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: bookingNumber, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Booking fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/GuestBooking' }
 *       401: { description: Missing, invalid or expired token }
 *       404: { description: Booking not found (also when it belongs to another guest) }
 */
router.get(
  '/bookings/:bookingNumber',
  authenticateGuest,
  validate(guestBookingParamsSchema),
  guestAuthController.myBooking
);

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Change the current guest's password
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Password changed }
 */
router.post(
  '/change-password',
  authenticateGuest,
  validate(guestChangePasswordSchema),
  guestAuthController.changePassword
);

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Request a password reset token
 *     responses:
 *       200: { description: Reset token issued if the email exists }
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate(guestForgotPasswordSchema),
  guestAuthController.forgotPassword
);

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     tags: [Guest Auth]
 *     summary: Reset password using a reset token
 *     responses:
 *       200: { description: Password reset }
 */
router.post(
  '/reset-password',
  authLimiter,
  validate(guestResetPasswordSchema),
  guestAuthController.resetPassword
);

export default router;
