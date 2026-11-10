import { randomInt } from 'crypto';
import { env } from '../config/env';

/** Digits in the random part of ticket and booking numbers. */
export const TICKET_NUMBER_DIGITS = 6;

const randomDigits = () =>
  randomInt(0, 10 ** TICKET_NUMBER_DIGITS).toString().padStart(TICKET_NUMBER_DIGITS, '0');

/** Admin-configured ticket prefixes: 2-10 capital letters, e.g. VIP or THREE. */
export const ID_PREFIX_PATTERN = /^[A-Z]{2,10}$/;

/** Prefixes the default formats use, so a ticket can't claim them. */
export function reservedIdPrefixes(): string[] {
  return ['KILF', env.TICKET_NUMBER_PREFIX.toUpperCase()];
}

/**
 * Generates a booking number: `VIP-2026-000123` for a ticket with a prefix,
 * otherwise `KILF-2026-000123`. Uniqueness is enforced by the database
 * unique constraint; callers retry on a rare collision.
 */
export function generateBookingNumber(idPrefix?: string | null, year: number = new Date().getFullYear()): string {
  return `${idPrefix || 'KILF'}-${year}-${randomDigits()}`;
}

/**
 * The fixed part of a ticket number: `VIP-` for a ticket with a prefix,
 * otherwise the default `LF-2026-`.
 */
export function ticketNumberPrefix(idPrefix?: string | null, year: number = new Date().getFullYear()): string {
  return idPrefix ? `${idPrefix}-` : `${env.TICKET_NUMBER_PREFIX}-${year}-`;
}

/** Generates a ticket number like VIP-000123, or LF-2026-000123 without a prefix. */
export function generateTicketNumber(idPrefix?: string | null, year: number = new Date().getFullYear()): string {
  return `${ticketNumberPrefix(idPrefix, year)}${randomDigits()}`;
}
