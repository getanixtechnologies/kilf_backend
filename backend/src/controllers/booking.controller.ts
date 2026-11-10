import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPaginationParams } from '../utils/pagination';
import { toCsv } from '../utils/csv';
import * as bookingService from '../services/booking.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

// ---- Public ----

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { booking, payment } = await bookingService.createBooking(req.body);
  return sendSuccess(
    res,
    {
      booking: {
        id: booking!.id,
        bookingNumber: booking!.bookingNumber,
        status: booking!.status,
        quantity: booking!.quantity,
        subtotalAmount: booking!.subtotalAmount,
        gstAmount: booking!.gstAmount,
        totalAmount: booking!.totalAmount,
        currency: booking!.currency,
      },
      // Present only when the booking is still PENDING_PAYMENT: whatever the
      // active PaymentProvider returned to let the client complete checkout
      // (e.g. Razorpay's { keyId, orderId, amount, currency }). The mock
      // provider settles synchronously, so this is normally absent.
      ...(booking!.status === 'PENDING_PAYMENT' ? { payment: payment?.raw ?? null } : {}),
    },
    'Booking created',
    201
  );
});

export const quote = asyncHandler(async (req: Request, res: Response) => {
  const result = await bookingService.quoteBooking(req.body.ticketId, Number(req.body.quantity));
  return sendSuccess(res, result, 'Price calculated');
});

export const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingService.confirmPaymentByBookingNumber(req.params.bookingNumber);
  return sendSuccess(res, booking, 'Payment status verified');
});

export const lookupByNumber = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingService.getBookingByNumberForCustomer(
    req.params.bookingNumber,
    String(req.query.email)
  );
  return sendSuccess(res, booking, 'Booking fetched');
});

// ---- Admin ----

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const { status, ticketId, festivalId, search, dateFrom, dateTo } = req.query as Record<
    string,
    string | undefined
  >;
  const result = await bookingService.listBookings({
    page,
    limit,
    status: status as any,
    ticketId,
    festivalId,
    search,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
  });
  return sendSuccess(res, result.items, 'Bookings fetched', 200, result.pagination);
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const { status, ticketId, festivalId, search, dateFrom, dateTo } = req.query as Record<
    string,
    string | undefined
  >;
  const bookings = await bookingService.exportBookingsCsv({
    status: status as any,
    ticketId,
    festivalId,
    search,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
  });

  const rows = bookings.map((b) => ({
    bookingNumber: b.bookingNumber,
    customerName: b.customer.name,
    customerEmail: b.customer.email,
    customerPhone: b.customer.phone,
    tickets: b.bookingItems.map((i) => `${i.ticket.name} x${i.quantity}`).join('; '),
    quantity: b.quantity,
    totalAmount: b.totalAmount.toString(),
    currency: b.currency,
    paymentStatus: b.payments[0]?.status ?? 'N/A',
    bookingStatus: b.status,
    bookingDate: b.createdAt.toISOString(),
  }));

  const csv = toCsv(rows, [
    'bookingNumber',
    'customerName',
    'customerEmail',
    'customerPhone',
    'tickets',
    'quantity',
    'totalAmount',
    'currency',
    'paymentStatus',
    'bookingStatus',
    'bookingDate',
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="bookings-${Date.now()}.csv"`);
  res.status(200).send(csv);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingService.getBooking(req.params.id);
  return sendSuccess(res, booking, 'Booking fetched');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const before = await bookingService.getBooking(req.params.id);
  const booking = await bookingService.cancelBooking(req.params.id, req.body.reason);
  await recordAuditLogFromRequest(
    req,
    'CANCELLED_BOOKING',
    'Booking',
    booking.id,
    { status: before.status },
    { status: booking.status, reason: req.body.reason }
  );
  return sendSuccess(res, booking, 'Booking cancelled');
});

export const recheckPayment = asyncHandler(async (req: Request, res: Response) => {
  const before = await bookingService.getBooking(req.params.id);
  const booking = await bookingService.recheckPayments(req.params.id);
  await recordAuditLogFromRequest(
    req,
    'RECHECKED_PAYMENT',
    'Booking',
    before.id,
    { status: before.status },
    { status: booking!.status }
  );
  return sendSuccess(res, booking, 'Payment re-checked with the gateway');
});

export const refund =asyncHandler(async (req: Request, res: Response) => {
  const before = await bookingService.getBooking(req.params.id);
  const booking = await bookingService.refundBooking(req.params.id, req.body.reason);
  await recordAuditLogFromRequest(
    req,
    'REFUNDED_BOOKING',
    'Booking',
    booking.id,
    { status: before.status },
    { status: booking.status, reason: req.body.reason }
  );
  return sendSuccess(res, booking, 'Booking refunded');
});
