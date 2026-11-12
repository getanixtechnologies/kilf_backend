import { z } from 'zod';

const ticketNumber = z.string().trim().min(1, 'ticketNumber is required').max(64).transform((v) => v.toUpperCase());
/** How the checker entered the ticket: camera scan or typed. */
const method = z.enum(['QR', 'MANUAL']).optional();

export const verifyTicketSchema = z.object({
  body: z.object({
    ticketNumber,
    /** Gate or venue being scanned at; multi-day passes check in once per day per venue. */
    venue: z.string().trim().max(100).optional(),
    method,
  }),
});

export const checkInTicketSchema = z.object({
  body: z.object({
    ticketNumber,
    venue: z.string().trim().max(100).optional(),
    method,
  }),
});

export const listVerificationLogsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().trim().max(100).optional(),
    adminId: z.string().uuid().optional(),
    method: z.enum(['QR', 'MANUAL']).optional(),
    action: z.enum(['VERIFY', 'CHECK_IN']).optional(),
    outcome: z.enum(['VALID', 'CHECKED_IN', 'DUPLICATE', 'NOT_FOUND', 'INVALID']).optional(),
  }),
});
