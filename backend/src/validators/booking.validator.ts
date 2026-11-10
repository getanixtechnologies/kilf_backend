import { z } from 'zod';

const BookingStatusEnum = z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'PAYMENT_REVIEW']);

const attendeeSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(20).optional(),
  dateOfBirth: z.coerce.date().optional(),
  /** Festival day this ticket is for (Day Pass). */
  validDate: z.coerce.date().optional(),
  /** Show the attendee is booked into (Khasak show, Elite). */
  showSessionId: z.string().uuid().optional(),
});

export const createBookingSchema = z.object({
  body: z
    .object({
      ticketId: z.string().uuid(),
      /** Required when attendees are omitted; when both are sent they must match. */
      quantity: z.coerce.number().int().positive().max(20, 'Maximum 20 tickets per booking').optional(),
      customer: z.object({
        name: z.string().min(2).max(200),
        email: z.string().email(),
        phone: z.string().min(6).max(20),
      }),
      /** Optional: one entry per ticket. Omitted -> every ticket is in the customer's name. */
      attendees: z.array(attendeeSchema).min(1).max(20, 'Maximum 20 tickets per booking').optional(),
    })
    .refine((d) => d.quantity !== undefined || d.attendees !== undefined, {
      message: 'Either quantity or attendees is required',
      path: ['quantity'],
    })
    .refine((d) => d.quantity === undefined || d.attendees === undefined || d.quantity === d.attendees.length, {
      message: 'quantity must match the number of attendees',
      path: ['quantity'],
    }),
});

export const bookingQuoteSchema = z.object({
  body: z.object({
    ticketId: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(20, 'Maximum 20 tickets per booking'),
  }),
});

export const confirmPaymentSchema = z.object({
  params: z.object({ bookingNumber: z.string().min(1) }),
});

export const publicBookingLookupSchema = z.object({
  params: z.object({ bookingNumber: z.string().min(1) }),
  query: z.object({ email: z.string().email() }),
});

export const listBookingsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    status: BookingStatusEnum.optional(),
    ticketId: z.string().uuid().optional(),
    festivalId: z.string().uuid().optional(),
    search: z.string().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  }),
});

export const bookingIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const updateBookingStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['CANCELLED']),
    reason: z.string().max(500).optional(),
  }),
});

export const refundBookingSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
});
