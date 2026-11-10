import { Router } from 'express';
import { authenticate, denyScanner } from '../../middleware/auth';
import authRoutes from '../auth.routes';
import dashboardRoutes from './dashboard.routes';
import festivalRoutes from './festival.routes';
import ticketRoutes from './ticket.routes';
import checkinRoutes from './checkin.routes';
import bookingRoutes from './booking.routes';
import sponsorRoutes from './sponsor.routes';
import revenueRoutes from './revenue.routes';
import auditLogRoutes from './auditLog.routes';
import earlyBirdRoutes from './earlyBird.routes';
import enquiryRoutes from './enquiry.routes';
import showSessionRoutes from './showSession.routes';
import scannerRoutes from './scanner.routes';
import verificationLogRoutes from './verificationLog.routes';

const router = Router();

// SCANNER (gate staff) accounts may use /auth and the check-in routes only.
// Every other router sits behind `guarded`, which rejects them.
const guarded = [authenticate, denyScanner];

router.use('/auth', authRoutes);
// Check-in routes come first so scanners reach /verify and /check-in; the CRUD
// ticket routes share the prefix but are guarded.
router.use('/tickets', checkinRoutes);
router.use('/tickets', ...guarded, ticketRoutes);
router.use('/dashboard', ...guarded, dashboardRoutes);
router.use('/festivals', ...guarded, festivalRoutes);
router.use('/bookings', ...guarded, bookingRoutes);
router.use('/sponsors', ...guarded, sponsorRoutes);
router.use('/revenue', ...guarded, revenueRoutes);
router.use('/audit-logs', ...guarded, auditLogRoutes);
router.use('/early-bird', ...guarded, earlyBirdRoutes);
router.use('/enquiries', ...guarded, enquiryRoutes);
router.use('/show-sessions', ...guarded, showSessionRoutes);
router.use('/scanners', ...guarded, scannerRoutes);
router.use('/verification-logs', ...guarded, verificationLogRoutes);

export default router;
