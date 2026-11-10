import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { toZonedDate } from '../utils/istDate';

const instanceInclude = {
  ticket: {
    select: {
      id: true,
      name: true,
      ticketType: true,
      multiDay: true,
      requiresDate: true,
      validityDays: true,
      allowReentry: true,
    },
  },
  attendee: {
    select: {
      id: true,
      name: true,
      validDate: true,
      showSession: { select: { id: true, name: true, venue: true, startsAt: true } },
    },
  },
  booking: {
    select: {
      bookingNumber: true,
      status: true,
      customer: { select: { name: true, email: true } },
      festival: { select: { startDate: true, endDate: true, timezone: true } },
    },
  },
  checkIns: { orderBy: { checkedInAt: 'desc' as const } },
} satisfies Prisma.TicketInstanceInclude;

type LoadedInstance = Prisma.TicketInstanceGetPayload<{ include: typeof instanceInclude }>;

/** Machine-readable result of validating a ticket at the gate. */
export type CheckInCode =
  | 'VALID'
  | 'NOT_FOUND'
  | 'NOT_CONFIRMED'
  | 'CANCELLED'
  | 'INVALID_DATE'
  | 'EXPIRED'
  | 'ALREADY_CHECKED_IN';

export const CHECK_IN_MESSAGES: Record<CheckInCode, string> = {
  VALID: 'Valid ticket – Entry permitted.',
  NOT_FOUND: 'Ticket not found – No booking matches this ID.',
  NOT_CONFIRMED: 'Booking not confirmed – Ticket cannot be used.',
  CANCELLED: 'Ticket cancelled – Entry not permitted.',
  INVALID_DATE: "Invalid date – Ticket is not valid for today's event.",
  EXPIRED: 'Ticket expired – Validity period has ended.',
  ALREADY_CHECKED_IN: 'Already checked in – Ticket has already been used today.',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

export interface ValidityWindow {
  /** First and last event day (inclusive) the ticket admits, as UTC-midnight dates. */
  firstDay: Date;
  lastDay: Date;
  /** Event day number of `today` (1 = festival's first day). */
  eventDay: number;
  /** Ticket is tracked per day (one check-in row per day) rather than single-use. */
  perDay: boolean;
}

/**
 * The event days a ticket admits, from the festival's configured dates (in its
 * timezone) and the ticket's validity, never from the purchase date.
 *
 * - Attendee picked a day (Day Pass) → window starts on that day.
 * - Single-show ticket → window is the show's day.
 * - Otherwise → window starts on festival day 1.
 * Length is `validityDays`, or every festival day for multiDay passes, or 1.
 * The window never runs past the festival's last day.
 */
export function validityWindow(instance: LoadedInstance, today: Date): ValidityWindow {
  const { ticket, attendee, booking } = instance;
  const tz = booking.festival.timezone;
  const festivalFirst = toZonedDate(booking.festival.startDate, tz);
  const festivalLast = toZonedDate(booking.festival.endDate, tz);
  const festivalDays = Math.round((festivalLast.getTime() - festivalFirst.getTime()) / DAY_MS) + 1;

  let start = festivalFirst;
  if (attendee?.validDate) start = attendee.validDate;
  else if (!ticket.multiDay && attendee?.showSession) start = toZonedDate(attendee.showSession.startsAt, tz);

  const days = ticket.validityDays ?? (ticket.multiDay ? festivalDays : 1);
  let last = addDays(start, Math.max(days, 1) - 1);
  if (last > festivalLast && start <= festivalLast) last = festivalLast;

  return {
    firstDay: start,
    lastDay: last,
    eventDay: Math.round((today.getTime() - festivalFirst.getTime()) / DAY_MS) + 1,
    perDay: ticket.multiDay || days > 1,
  };
}

export interface Evaluation {
  code: CheckInCode;
  valid: boolean;
  alreadyUsed: boolean;
  message: string;
  detail?: string;
  today: Date;
  window?: ValidityWindow;
}

/**
 * The one place gate rules live. Both verify and check-in, for QR scans and
 * typed booking IDs alike, go through here.
 */
function evaluate(instance: LoadedInstance | null, venue: string, now = new Date()): Evaluation {
  const tz = instance?.booking.festival.timezone ?? 'Asia/Kolkata';
  const today = toZonedDate(now, tz);
  const result = (code: CheckInCode, extra: Partial<Evaluation> = {}): Evaluation => ({
    code,
    valid: code === 'VALID' || code === 'ALREADY_CHECKED_IN',
    alreadyUsed: code === 'ALREADY_CHECKED_IN',
    message: CHECK_IN_MESSAGES[code],
    today,
    ...extra,
  });

  // 1. Booking exists and is usable.
  if (!instance) return result('NOT_FOUND');
  if (instance.booking.status !== 'CONFIRMED') return result('NOT_CONFIRMED');
  if (instance.status === 'CANCELLED') return result('CANCELLED');

  // 2 & 4. Valid for today's event date / validity not expired.
  const window = validityWindow(instance, today);
  const range =
    fmt(window.firstDay) === fmt(window.lastDay)
      ? `Valid on ${fmt(window.firstDay)}`
      : `Valid ${fmt(window.firstDay)} to ${fmt(window.lastDay)}`;
  if (today > window.lastDay) return result('EXPIRED', { window, detail: range });
  if (today < window.firstDay) return result('INVALID_DATE', { window, detail: range });

  // 3. Already checked in today (unless re-entry is allowed).
  if (!instance.ticket.allowReentry) {
    const usedToday = window.perDay
      ? instance.checkIns.find((c) => c.checkInDate.getTime() === today.getTime() && c.venue === venue)
      : instance.status === 'USED'
        ? { checkedInAt: instance.checkedInAt }
        : undefined;
    if (usedToday) {
      return result('ALREADY_CHECKED_IN', {
        window,
        detail: usedToday.checkedInAt ? `Checked in at ${usedToday.checkedInAt.toISOString()}` : undefined,
      });
    }
  }

  return result('VALID', { window, detail: range });
}

async function loadInstance(ticketNumber: string) {
  return prisma.ticketInstance.findUnique({ where: { ticketNumber }, include: instanceInclude });
}

export async function verifyTicket(ticketNumber: string, venue = '') {
  const instance = await loadInstance(ticketNumber);
  const ev = evaluate(instance, venue);
  return {
    code: ev.code,
    valid: ev.valid,
    alreadyUsed: ev.alreadyUsed,
    message: ev.message,
    detail: ev.detail ?? null,
    eventDate: fmt(ev.today),
    eventDay: ev.window?.eventDay ?? null,
    validFrom: ev.window ? fmt(ev.window.firstDay) : null,
    validUntil: ev.window ? fmt(ev.window.lastDay) : null,
    ticket: instance,
  };
}

function rejection(ev: Evaluation) {
  const errors = [{ code: ev.code, detail: ev.detail }];
  switch (ev.code) {
    case 'NOT_FOUND':
      return new ApiError(404, ev.message, errors);
    case 'ALREADY_CHECKED_IN':
      return ApiError.conflict(ev.message, errors);
    default:
      return ApiError.badRequest(ev.message, errors);
  }
}

/**
 * Records an entry. Every entry gets a TicketCheckIn row for the event day;
 * single-use tickets are also flipped to USED. With re-entry, later entries on
 * the same day/venue get increasing `entryNumber`s.
 */
export async function checkInTicket(ticketNumber: string, adminId: string, venue = '') {
  const instance = await loadInstance(ticketNumber);
  const ev = evaluate(instance, venue);
  if (ev.code !== 'VALID' || !instance || !ev.window) throw rejection(ev);
  const { today, window } = ev;

  const sameDayEntries = instance.checkIns.filter(
    (c) => c.checkInDate.getTime() === today.getTime() && c.venue === venue
  ).length;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticketCheckIn.create({
        data: {
          ticketInstanceId: instance.id,
          checkInDate: today,
          venue,
          checkedInById: adminId,
          entryNumber: instance.ticket.allowReentry ? sameDayEntries + 1 : 1,
        },
      });
      if (!window.perDay && !instance.ticket.allowReentry) {
        // Guard against a concurrent scan that already used the ticket.
        const { count } = await tx.ticketInstance.updateMany({
          where: { id: instance.id, status: 'VALID' },
          data: { status: 'USED' },
        });
        if (count === 0) throw ApiError.conflict(CHECK_IN_MESSAGES.ALREADY_CHECKED_IN);
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict(CHECK_IN_MESSAGES.ALREADY_CHECKED_IN, [{ code: 'ALREADY_CHECKED_IN' }]);
    }
    throw err;
  }

  return prisma.ticketInstance.update({
    where: { ticketNumber },
    data: {
      checkedInAt: new Date(),
      checkedInById: adminId,
      ...(!window.perDay ? { status: 'USED' as const } : {}),
    },
    include: { checkIns: { orderBy: { checkedInAt: 'desc' } } },
  });
}

/** Ticket types with a configured ID prefix, for the checker's manual-entry box. */
export async function listTicketIdPrefixes() {
  const tickets = await prisma.ticket.findMany({
    where: { idPrefix: { not: null }, archivedAt: null },
    select: { name: true, idPrefix: true },
    orderBy: { idPrefix: 'asc' },
  });
  return tickets as { name: string; idPrefix: string }[];
}
