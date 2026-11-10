import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';

const guestBookingInclude = {
  festival: { select: { name: true, startDate: true, endDate: true } },
  customer: { select: { name: true, email: true, phone: true } },
  bookingItems: { select: { ticket: { select: { name: true, ticketType: true } } } },
  payments: { orderBy: { createdAt: 'desc' } },
  ticketInstances: {
    orderBy: { ticketNumber: 'asc' },
    include: {
      attendee: {
        select: {
          name: true,
          validDate: true,
          showSession: { select: { name: true, startsAt: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

type GuestBookingRow = Prisma.BookingGetPayload<{ include: typeof guestBookingInclude }>;

function toGuestBookingDto(b: GuestBookingRow) {
  // Prefer the successful attempt; otherwise the latest one.
  const payment = b.payments.find((p) => p.status === 'SUCCESS') ?? b.payments[0] ?? null;
  const ticket = b.bookingItems[0]?.ticket ?? null;
  return {
    bookingNumber: b.bookingNumber,
    status: b.status,
    quantity: b.quantity,
    subtotalAmount: b.subtotalAmount,
    gstAmount: b.gstAmount,
    totalAmount: b.totalAmount,
    currency: b.currency,
    createdAt: b.createdAt,
    ticket: ticket ? { name: ticket.name, ticketType: ticket.ticketType } : null,
    festival: b.festival,
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          razorpayPaymentId: payment.gatewayPaymentId,
          paidAt: payment.status === 'SUCCESS' ? payment.updatedAt : null,
        }
      : null,
    customer: b.customer,
    ticketInstances: b.ticketInstances.map((t) => ({
      ticketNumber: t.ticketNumber,
      // The stored QR data URL: the same image the checker scanner verifies.
      qrCode: t.qrCode,
      status: t.status,
      attendee: t.attendee ? { name: t.attendee.name, validDate: t.attendee.validDate } : null,
      showSession: t.attendee?.showSession
        ? { name: t.attendee.showSession.name, startTime: t.attendee.showSession.startsAt }
        : null,
    })),
  };
}

export async function listGuestBookings(guestId: string, skip: number, take: number) {
  const where = { guestId };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: guestBookingInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.booking.count({ where }),
  ]);
  return { bookings: rows.map(toGuestBookingDto), total };
}

/** 404 both when the booking is missing and when it belongs to another guest. */
export async function getGuestBooking(guestId: string, bookingNumber: string) {
  const booking = await prisma.booking.findFirst({
    where: { bookingNumber, guestId },
    include: guestBookingInclude,
  });
  if (!booking) throw ApiError.notFound('Booking not found');
  return toGuestBookingDto(booking);
}
