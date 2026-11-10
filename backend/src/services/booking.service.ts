import { Prisma, BookingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { buildPagination } from '../utils/apiResponse';
import { generateBookingNumber, generateTicketNumber } from '../utils/idGenerators';
import { generateQrCodeDataUrl } from './qrcode.service';
import { paymentProvider } from './payment';
import * as bookingRepository from '../repositories/booking.repository';
import { env } from '../config/env';
import { ageOn, toIstDate } from '../utils/istDate';
import { releaseShowSeats } from './showSeats';
import { logger } from '../config/logger';

export interface AttendeeInput {
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  validDate?: Date;
  showSessionId?: string;
}

export interface CreateBookingInput {
  ticketId: string;
  quantity?: number;
  customer: { name: string; email: string; phone: string };
  attendees: AttendeeInput[];
}

// Tickets are priced in rupees only; bookings and payments carry the currency for the gateway.
const DEFAULT_CURRENCY = 'INR';

const MAX_BOOKING_NUMBER_RETRIES = 5;

/** GST is charged on top of the ticket price and rounded to paise. */
function gstOn(subtotal: Prisma.Decimal, ratePercent: Prisma.Decimal) {
  return subtotal.mul(ratePercent).div(100).toDecimalPlaces(2);
}

/**
 * Checks each attendee against the ticket's pass rules (day, show, age) and
 * returns the attendees with dates normalised to IST calendar days.
 */
function validateAttendees(
  ticket: {
    name: string;
    requiresDate: boolean;
    requiresShowSession: boolean;
    minAge: number | null;
    maxAge: number | null;
  },
  festival: { startDate: Date; endDate: Date },
  attendees: AttendeeInput[]
) {
  const firstDay = toIstDate(festival.startDate);
  const lastDay = toIstDate(festival.endDate);

  return attendees.map((a, idx) => {
    const label = `Attendee ${idx + 1} (${a.name})`;
    const validDate = a.validDate ? toIstDate(a.validDate) : undefined;

    if (ticket.requiresDate) {
      if (!validDate) throw ApiError.badRequest(`${label}: validDate is required for ${ticket.name}`);
      if (validDate < firstDay || validDate > lastDay) {
        throw ApiError.badRequest(`${label}: validDate must fall within the festival dates`);
      }
    }

    if (ticket.requiresShowSession && !a.showSessionId) {
      throw ApiError.badRequest(`${label}: showSessionId is required for ${ticket.name}`);
    }

    if (ticket.minAge !== null || ticket.maxAge !== null) {
      if (!a.dateOfBirth) {
        throw ApiError.badRequest(`${label}: dateOfBirth is required for ${ticket.name}`);
      }
      const age = ageOn(a.dateOfBirth, festival.startDate);
      if (ticket.minAge !== null && age < ticket.minAge) {
        throw ApiError.badRequest(`${label}: must be at least ${ticket.minAge} years old`);
      }
      if (ticket.maxAge !== null && age > ticket.maxAge) {
        throw ApiError.badRequest(`${label}: must be at most ${ticket.maxAge} years old`);
      }
    }

    return {
      ...a,
      validDate: ticket.requiresDate ? validDate : undefined,
      showSessionId: ticket.requiresShowSession ? a.showSessionId : undefined,
    };
  });
}

/** Locks the requested show sessions and takes one seat per attendee booked into them. */
async function reserveShowSeats(
  tx: Prisma.TransactionClient,
  festivalId: string,
  attendees: { showSessionId?: string }[]
) {
  const counts = new Map<string, number>();
  for (const a of attendees) {
    if (a.showSessionId) counts.set(a.showSessionId, (counts.get(a.showSessionId) ?? 0) + 1);
  }

  // Sorted so concurrent bookings lock sessions in the same order (no deadlocks).
  for (const [sessionId, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    await tx.$executeRaw`SELECT id FROM show_sessions WHERE id = ${sessionId} FOR UPDATE`;
    const session = await tx.showSession.findUnique({ where: { id: sessionId } });
    if (!session || session.festivalId !== festivalId) throw ApiError.notFound('Show session not found');
    if (session.status !== 'ACTIVE') throw ApiError.badRequest(`${session.name} is not open for booking`);
    if (session.startsAt < new Date()) throw ApiError.badRequest(`${session.name} has already started`);
    if (session.availableSeats < count) {
      throw ApiError.conflict(`Only ${session.availableSeats} seat(s) left for ${session.name}`);
    }
    await tx.showSession.update({
      where: { id: sessionId },
      data: { availableSeats: { decrement: count } },
    });
  }
}

/**
 * Reserves inventory and creates a PENDING_PAYMENT booking.
 *
 * Concurrency safety: `SELECT ... FOR UPDATE` takes a row lock on the
 * ticket for the lifetime of the transaction, so two simultaneous requests
 * for the last ticket serialize on this row - the second request sees the
 * decremented `availableQuantity` and is rejected before any inventory can
 * go negative. The subsequent conditional `updateMany` (WHERE availableQuantity
 * >= quantity) is a defense-in-depth atomic guard against overselling.
 */
async function reserveInventoryAndCreateBooking(input: CreateBookingInput) {
  const quantity = input.attendees.length;

  return prisma.$transaction(async (tx) => {
    // Ticket ids are stored as TEXT (Prisma's default for `String @id`), not native uuid.
    await tx.$executeRaw`SELECT id FROM tickets WHERE id = ${input.ticketId} FOR UPDATE`;

    const ticket = await tx.ticket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) {
      throw ApiError.notFound('Ticket not found');
    }

    const now = new Date();
    if (ticket.status !== 'ACTIVE') {
      throw ApiError.badRequest('This ticket is not available for sale');
    }
    if (ticket.salesStart > now) {
      throw ApiError.badRequest('Ticket sales have not started yet');
    }
    if (ticket.salesEnd < now) {
      throw ApiError.badRequest('Ticket sales have ended');
    }
    if (ticket.availableQuantity < quantity) {
      throw ApiError.conflict(`Only ${ticket.availableQuantity} ticket(s) left, cannot book ${quantity}`);
    }

    const festival = await tx.festival.findUniqueOrThrow({ where: { id: ticket.festivalId } });
    const attendees = validateAttendees(ticket, festival, input.attendees);

    const decremented = await tx.ticket.updateMany({
      where: { id: input.ticketId, availableQuantity: { gte: quantity } },
      data: { availableQuantity: { decrement: quantity } },
    });
    if (decremented.count === 0) {
      throw ApiError.conflict('Ticket became unavailable while processing your booking');
    }

    await reserveShowSeats(tx, ticket.festivalId, attendees);

    const customer = await tx.customer.upsert({
      where: { email: input.customer.email.toLowerCase() },
      update: { name: input.customer.name, phone: input.customer.phone },
      create: {
        name: input.customer.name,
        email: input.customer.email.toLowerCase(),
        phone: input.customer.phone,
      },
    });

    const unitPrice = ticket.price;
    const subtotal = unitPrice.mul(quantity);
    const gstAmount = gstOn(subtotal, ticket.gstRate);
    const totalAmount = subtotal.add(gstAmount);
    // Free registrations (e.g. New Year's Eve) need no payment: confirm straight away.
    const isFree = totalAmount.isZero();
    const expiresAt = isFree ? null : new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60 * 1000);

    let booking;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const bookingNumber = generateBookingNumber(ticket.idPrefix);
      try {
        booking = await tx.booking.create({
          data: {
            bookingNumber,
            festivalId: ticket.festivalId,
            customerId: customer.id,
            status: isFree ? 'CONFIRMED' : 'PENDING_PAYMENT',
            quantity,
            subtotalAmount: subtotal,
            gstAmount,
            totalAmount,
            currency: DEFAULT_CURRENCY,
            expiresAt,
            bookingItems: {
              create: [
                {
                  ticketId: ticket.id,
                  quantity,
                  unitPrice,
                  subtotal,
                  gstRate: ticket.gstRate,
                  gstAmount,
                  attendees: {
                    create: attendees.map((a) => ({
                      name: a.name,
                      email: a.email?.toLowerCase(),
                      phone: a.phone,
                      dateOfBirth: a.dateOfBirth ? toIstDate(a.dateOfBirth) : undefined,
                      validDate: a.validDate,
                      showSessionId: a.showSessionId,
                    })),
                  },
                },
              ],
            },
          },
          include: { bookingItems: true, customer: true },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < MAX_BOOKING_NUMBER_RETRIES
        ) {
          continue; // extremely rare booking number collision - retry with a new random number
        }
        throw err;
      }
    }

    if (isFree) {
      await issueTicketInstances(tx, booking.id, booking.bookingItems);
    }

    return booking;
  });
}

async function releaseInventory(
  tx: Prisma.TransactionClient,
  bookingId: string,
  items: { ticketId: string; quantity: number }[]
) {
  for (const item of items) {
    await tx.ticket.update({
      where: { id: item.ticketId },
      data: { availableQuantity: { increment: item.quantity } },
    });
  }
  await releaseShowSeats(tx, bookingId);
}

/**
 * A ticket number not yet in use. Checked before insert because a unique
 * violation would abort the surrounding transaction.
 */
async function uniqueTicketNumber(tx: Prisma.TransactionClient, idPrefix: string | null) {
  for (let i = 0; i < 10; i++) {
    const ticketNumber = generateTicketNumber(idPrefix);
    const taken = await tx.ticketInstance.findUnique({ where: { ticketNumber }, select: { id: true } });
    if (!taken) return ticketNumber;
  }
  throw ApiError.conflict('Could not allocate a ticket number, please retry');
}

/** Issues one QR ticket per attendee (falling back to one per unit for bookings that predate attendees). */
async function issueTicketInstances(
  tx: Prisma.TransactionClient,
  bookingId: string,
  bookingItems: { id: string; ticketId: string; quantity: number }[]
) {
  for (const item of bookingItems) {
    const attendees = await tx.bookingAttendee.findMany({
      where: { bookingItemId: item.id },
      orderBy: { createdAt: 'asc' },
    });
    const { idPrefix } = await tx.ticket.findUniqueOrThrow({ where: { id: item.ticketId }, select: { idPrefix: true } });
    const attendeeIds: (string | null)[] =
      attendees.length > 0 ? attendees.map((a) => a.id) : Array.from({ length: item.quantity }, () => null);

    for (const attendeeId of attendeeIds) {
      const ticketNumber = await uniqueTicketNumber(tx, idPrefix);
      const qrCode = await generateQrCodeDataUrl(ticketNumber);
      await tx.ticketInstance.create({
        data: {
          bookingId,
          bookingItemId: item.id,
          ticketId: item.ticketId,
          attendeeId,
          ticketNumber,
          qrCode,
          status: 'VALID',
        },
      });
    }
  }
}

/**
 * Creates a booking end-to-end: reserve inventory, create the payment
 * intent with the active PaymentProvider, then verify that payment on the
 * server (never trusting a client-supplied "it succeeded") before
 * confirming the booking and issuing QR ticket instances.
 */
const PROVIDER_NAME_TO_ENUM: Record<string, Prisma.PaymentUncheckedCreateInput['provider']> = {
  mock: 'MOCK',
  razorpay: 'RAZORPAY',
  stripe: 'STRIPE',
};

export async function createBooking(input: CreateBookingInput) {
  const booking = await reserveInventoryAndCreateBooking(input);

  if (booking.status === 'CONFIRMED') {
    // Free registration: already confirmed with tickets issued, no payment to create.
    const confirmed = await bookingRepository.findById(booking.id);
    return { booking: confirmed!, payment: null };
  }

  const paymentResult = await paymentProvider.createPayment({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    amount: Number(booking.totalAmount),
    currency: booking.currency,
    customerEmail: booking.customer.email,
  });

  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider: PROVIDER_NAME_TO_ENUM[paymentProvider.name] ?? 'MOCK',
      providerPaymentId: paymentResult.providerPaymentId,
      amount: booking.totalAmount,
      currency: booking.currency,
      status: paymentResult.status,
      rawResponse: paymentResult.raw as Prisma.InputJsonValue,
    },
  });

  const finalBooking = await settlePaymentResult(booking.id, paymentResult.providerPaymentId);
  // `payment` carries whatever the client needs to complete checkout with the
  // active gateway (e.g. Razorpay's order id + publishable key id). For the
  // mock provider it's inert, since the mock settles synchronously above.
  return { booking: finalBooking, payment: paymentResult };
}

/** Cancel reason set automatically when every payment attempt failed (as opposed to an admin cancelling). */
const AUTO_CANCEL_REASON = 'Payment failed';

/**
 * Takes the booking's inventory back after its hold was released (late payment).
 * Returns false, changing nothing, if any ticket or show seat is no longer available.
 */
async function reclaimInventory(
  tx: Prisma.TransactionClient,
  booking: { id: string; bookingItems: { ticketId: string; quantity: number }[] }
): Promise<boolean> {
  const byTicket = new Map<string, number>();
  for (const i of booking.bookingItems) byTicket.set(i.ticketId, (byTicket.get(i.ticketId) ?? 0) + i.quantity);

  const attendees = await tx.bookingAttendee.findMany({
    where: { bookingItem: { bookingId: booking.id }, showSessionId: { not: null } },
    select: { showSessionId: true },
  });
  const bySession = new Map<string, number>();
  for (const a of attendees) bySession.set(a.showSessionId!, (bySession.get(a.showSessionId!) ?? 0) + 1);

  // Same lock order as new bookings (tickets, then sessions sorted by id) to avoid deadlocks.
  const tickets = [...byTicket].sort(([a], [b]) => a.localeCompare(b));
  const sessions = [...bySession].sort(([a], [b]) => a.localeCompare(b));

  for (const [ticketId, qty] of tickets) {
    await tx.$executeRaw`SELECT id FROM tickets WHERE id = ${ticketId} FOR UPDATE`;
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t || t.availableQuantity < qty) return false;
  }
  for (const [sessionId, count] of sessions) {
    await tx.$executeRaw`SELECT id FROM show_sessions WHERE id = ${sessionId} FOR UPDATE`;
    const s = await tx.showSession.findUnique({ where: { id: sessionId } });
    if (!s || s.availableSeats < count) return false;
  }

  for (const [ticketId, qty] of tickets) {
    await tx.ticket.update({ where: { id: ticketId }, data: { availableQuantity: { decrement: qty } } });
  }
  for (const [sessionId, count] of sessions) {
    await tx.showSession.update({ where: { id: sessionId }, data: { availableSeats: { decrement: count } } });
  }
  return true;
}

/**
 * Verifies a payment on the backend (via PaymentProvider.verifyPayment) and
 * settles the booking accordingly. Called after creating a payment, from the
 * confirm endpoint, the Razorpay webhook, the reconciliation job, the hold-expiry
 * job and the admin "re-check" button. Safe to call any number of times.
 *
 * Outcomes by booking state when the gateway reports a captured payment:
 *  - PENDING_PAYMENT: confirm (or PAYMENT_REVIEW if the amount does not match).
 *  - EXPIRED / auto-cancelled (late payment): re-claim the inventory and confirm
 *    if it is still free, otherwise PAYMENT_REVIEW so an admin refunds the customer.
 *  - admin-cancelled: PAYMENT_REVIEW (customer paid for a booking we cancelled).
 *  - already CONFIRMED / REFUNDED / PAYMENT_REVIEW: only payment details are refreshed.
 *
 * PAYMENT_REVIEW invariant: the booking holds no inventory and has no tickets.
 */
export async function settlePaymentResult(bookingId: string, providerPaymentId: string) {
  const verification = await paymentProvider.verifyPayment({ providerPaymentId });
  const include = { bookingItems: true, customer: true, payments: true, ticketInstances: true } as const;

  return prisma.$transaction(async (tx) => {
    // Serialise concurrent settlers (webhook + client confirm + jobs) on this booking.
    await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;

    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include });
    if (!booking) throw ApiError.notFound('Booking not found');

    const payment = booking.payments.find((p) => p.providerPaymentId === providerPaymentId);
    if (payment) {
      const data: Prisma.PaymentUpdateInput = { lastCheckedAt: new Date() };
      if (payment.status !== 'REFUNDED') {
        if (verification.status === 'SUCCESS') data.status = 'SUCCESS';
        else if (verification.status === 'FAILED' && payment.status === 'PENDING') data.status = 'FAILED';
      }
      if (verification.gatewayPaymentId) data.gatewayPaymentId = verification.gatewayPaymentId;
      if (verification.method) data.method = verification.method;
      if (verification.failureReason) data.failureReason = verification.failureReason;
      await tx.payment.update({ where: { id: payment.id }, data });
    }

    const reload = () => tx.booking.findUnique({ where: { id: bookingId }, include });
    const items = booking.bookingItems.map((i) => ({ ticketId: i.ticketId, quantity: i.quantity }));
    const amountMismatch =
      verification.status === 'SUCCESS' &&
      verification.amount !== undefined &&
      Math.abs(verification.amount - Number(booking.totalAmount)) > 0.009;
    const mismatchReason = `Amount mismatch: gateway captured ${verification.amount}, expected ${booking.totalAmount}`;

    if (booking.status === 'PENDING_PAYMENT') {
      if (verification.status === 'SUCCESS' && amountMismatch) {
        await releaseInventory(tx, bookingId, items);
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'PAYMENT_REVIEW', cancelReason: mismatchReason },
        });
      } else if (verification.status === 'SUCCESS') {
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
        await issueTicketInstances(tx, bookingId, booking.bookingItems);
      } else if (verification.status === 'FAILED') {
        await releaseInventory(tx, bookingId, items);
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: AUTO_CANCEL_REASON },
        });
      }
      // PENDING: leave as PENDING_PAYMENT for the client to retry/poll.
      return reload();
    }

    // The booking already left PENDING_PAYMENT; only a *new* capture needs action.
    if (verification.status !== 'SUCCESS') return reload();

    const isAutoReleased =
      booking.status === 'EXPIRED' ||
      (booking.status === 'CANCELLED' && booking.cancelReason === AUTO_CANCEL_REASON);

    if (isAutoReleased) {
      if (!amountMismatch && (await reclaimInventory(tx, booking))) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED', cancelledAt: null, cancelReason: null },
        });
        await issueTicketInstances(tx, bookingId, booking.bookingItems);
        logger.info({ bookingId }, 'Late payment recovered: booking confirmed after hold release');
      } else {
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: 'PAYMENT_REVIEW',
            cancelReason: amountMismatch
              ? mismatchReason
              : 'Paid after the hold expired and tickets are sold out - refund the customer',
          },
        });
        logger.warn({ bookingId }, 'Late payment could not be honoured; booking flagged PAYMENT_REVIEW');
      }
    } else if (booking.status === 'CANCELLED') {
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'PAYMENT_REVIEW', cancelReason: 'Paid after an admin cancelled the booking - refund the customer' },
      });
      logger.warn({ bookingId }, 'Payment captured for admin-cancelled booking; flagged PAYMENT_REVIEW');
    }
    // CONFIRMED / REFUNDED / PAYMENT_REVIEW: nothing more to do.

    return reload();
  });
}

/**
 * Picks up refunds made outside this app (e.g. from the Razorpay dashboard):
 * if the gateway says the payment is fully refunded, mirror that locally.
 */
export async function syncRefundStatus(bookingId: string, providerPaymentId: string) {
  const status = await paymentProvider.getPaymentStatus(providerPaymentId);
  if (status.status !== 'REFUNDED') return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: true, payments: true },
    });
    if (!booking || !['CONFIRMED', 'PAYMENT_REVIEW'].includes(booking.status)) return;

    const payment = booking.payments.find((p) => p.providerPaymentId === providerPaymentId);
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAmount: payment.amount, lastCheckedAt: new Date() },
      });
    }
    if (booking.status === 'CONFIRMED') {
      await releaseInventory(
        tx,
        bookingId,
        booking.bookingItems.map((i) => ({ ticketId: i.ticketId, quantity: i.quantity }))
      );
      await tx.ticketInstance.updateMany({
        where: { bookingId, status: 'VALID' },
        data: { status: 'CANCELLED' },
      });
    }
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'REFUNDED', cancelledAt: new Date(), cancelReason: 'Refunded via payment gateway' },
    });
  });
}

export async function confirmPaymentByBookingNumber(bookingNumber: string) {
  const booking = await bookingRepository.findByBookingNumber(bookingNumber);
  if (!booking) throw ApiError.notFound('Booking not found');

  const latestPayment = booking.payments[0];
  if (!latestPayment) throw ApiError.badRequest('No payment found for this booking');

  return settlePaymentResult(booking.id, latestPayment.providerPaymentId!);
}

/** Admin "re-check with gateway": re-verifies every payment attempt and returns the fresh booking. */
export async function recheckPayments(bookingId: string) {
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');

  const ids = booking.payments.map((p) => p.providerPaymentId).filter((x): x is string => !!x);
  if (ids.length === 0) throw ApiError.badRequest('This booking has no payment to re-check');

  for (const id of ids) {
    await settlePaymentResult(bookingId, id);
    await syncRefundStatus(bookingId, id);
  }
  return bookingRepository.findById(bookingId);
}

export interface ListBookingsParams {
  page: number;
  limit: number;
  status?: BookingStatus;
  ticketId?: string;
  festivalId?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function listBookings(params: ListBookingsParams) {
  const skip = (params.page - 1) * params.limit;
  const { items, total } = await bookingRepository.findMany({ ...params, skip, take: params.limit });
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}

export async function exportBookingsCsv(params: Omit<ListBookingsParams, 'page' | 'limit'>) {
  return bookingRepository.findAllForExport(params);
}

export async function getBooking(id: string) {
  const booking = await bookingRepository.findById(id);
  if (!booking) throw ApiError.notFound('Booking not found');
  return booking;
}

export async function getBookingByNumberForCustomer(bookingNumber: string, email: string) {
  const booking = await bookingRepository.findByBookingNumber(bookingNumber);
  if (!booking || booking.customer.email.toLowerCase() !== email.toLowerCase()) {
    throw ApiError.notFound('Booking not found');
  }
  return booking;
}

/** Cancels a booking per the festival's cancellation policy and returns inventory. */
export async function cancelBooking(id: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id }, include: { bookingItems: true } });
    if (!booking) throw ApiError.notFound('Booking not found');

    if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status)) {
      throw ApiError.badRequest(`Cannot cancel a booking with status ${booking.status}`);
    }

    await releaseInventory(
      tx,
      id,
      booking.bookingItems.map((i) => ({ ticketId: i.ticketId, quantity: i.quantity }))
    );

    await tx.ticketInstance.updateMany({
      where: { bookingId: id, status: 'VALID' },
      data: { status: 'CANCELLED' },
    });

    return tx.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Cancelled by admin',
      },
    });
  });
}

/** Refunds a confirmed (or payment-review) booking's captured payment and returns inventory. */
export async function refundBooking(id: string, reason?: string) {
  const booking = await bookingRepository.findById(id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (!['CONFIRMED', 'PAYMENT_REVIEW'].includes(booking.status)) {
    throw ApiError.badRequest('Only confirmed or payment-review bookings can be refunded');
  }

  const successfulPayment = booking.payments.find((p) => p.status === 'SUCCESS');
  if (!successfulPayment || !successfulPayment.providerPaymentId) {
    throw ApiError.badRequest('No successful payment found for this booking');
  }

  const refundResult = await paymentProvider.refundPayment({
    providerPaymentId: successfulPayment.providerPaymentId,
    amount: Number(successfulPayment.amount),
    reason,
  });

  if (refundResult.status !== 'SUCCESS') {
    await prisma.payment.update({
      where: { id: successfulPayment.id },
      data: { failureReason: `Refund failed at ${new Date().toISOString()}` },
    });
    throw ApiError.badRequest('Refund could not be processed by the payment provider');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
    const current = await tx.booking.findUnique({ where: { id } });
    // A gateway refund webhook may have already applied this refund.
    if (!current || !['CONFIRMED', 'PAYMENT_REVIEW'].includes(current.status)) return current!;

    await tx.payment.update({
      where: { id: successfulPayment.id },
      data: {
        status: 'REFUNDED',
        refundedAmount: successfulPayment.amount,
        refundId: refundResult.refundId || undefined,
      },
    });

    // PAYMENT_REVIEW bookings hold no inventory and have no tickets.
    if (current.status === 'CONFIRMED') {
      await releaseInventory(
        tx,
        id,
        booking.bookingItems.map((i) => ({ ticketId: i.ticketId, quantity: i.quantity }))
      );
      await tx.ticketInstance.updateMany({
        where: { bookingId: id, status: 'VALID' },
        data: { status: 'CANCELLED' },
      });
    }

    return tx.booking.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Refunded by admin',
      },
    });
  });
}
