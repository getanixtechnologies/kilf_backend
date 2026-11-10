import { randomInt } from 'crypto';
import { env } from '../config/env';

/**
 * Generates a booking number like KILF-2026-000123.
 * Uniqueness is enforced by the database unique constraint; callers should
 * retry on a rare collision (see bookingRepository.createBookingWithNumber).
 */
export function generateBookingNumber(year: number = new Date().getFullYear()): string {
  const random = randomInt(0, 999999).toString().padStart(6, '0');
  return `KILF-${year}-${random}`;
}

/** Digits in the random part of a ticket number. */
export const TICKET_NUMBER_DIGITS = 6;

/** The fixed part of a ticket number for `year`, e.g. `LF-2026-`. */
export function ticketNumberPrefix(year: number = new Date().getFullYear()): string {
  return `${env.TICKET_NUMBER_PREFIX}-${year}-`;
}

/**
 * Generates a ticket number like LF-2026-000123.
 */
export function generateTicketNumber(year: number = new Date().getFullYear()): string {
  const random = randomInt(0, 10 ** TICKET_NUMBER_DIGITS - 1).toString().padStart(TICKET_NUMBER_DIGITS, '0');
  return `${ticketNumberPrefix(year)}${random}`;
}
