import { api } from './api';
import { ApiListResponse, TicketInstance } from '@/types';

export interface VerifyResult {
  code: 'VALID' | 'NOT_FOUND' | 'NOT_CONFIRMED' | 'CANCELLED' | 'INVALID_DATE' | 'EXPIRED' | 'ALREADY_CHECKED_IN';
  /** Extra context, e.g. "Valid 2026-12-01 to 2026-12-03". */
  detail: string | null;
  eventDate: string;
  eventDay: number | null;
  validFrom: string | null;
  validUntil: string | null;
  valid: boolean;
  alreadyUsed: boolean;
  message: string;
  ticket:
    | (TicketInstance & {
        ticket: { id: string; name: string; ticketType: string };
        attendee?: {
          name: string;
          validDate: string | null;
          showSession: { name: string; venue: string | null; startsAt: string } | null;
        } | null;
        booking: { bookingNumber: string; status: string; customer: { name: string; email: string } };
      })
    | null;
}

/** How the ticket number was entered at the gate. */
export type VerificationMethod = 'QR' | 'MANUAL';

export async function verifyTicket(ticketNumber: string, method?: VerificationMethod): Promise<VerifyResult> {
  const res = await api.post('/api/admin/tickets/verify', { ticketNumber, method });
  return res.data.data;
}

export async function checkInTicket(ticketNumber: string, method?: VerificationMethod): Promise<TicketInstance> {
  const res = await api.post('/api/admin/tickets/check-in', { ticketNumber, method });
  return res.data.data;
}

export interface TicketNumberFormat {
  /** Fixed part, e.g. `LF-2026-`. */
  prefix: string;
  /** Digits in the suffix; shorter typed suffixes are zero-padded. */
  digits: number;
  example: string;
  /** Every fixed part in use: one per ticket type with an ID prefix, then the default. */
  prefixes: { prefix: string; label: string }[];
}

export async function getTicketNumberFormat(): Promise<TicketNumberFormat> {
  const res = await api.get('/api/admin/tickets/number-format');
  return res.data.data;
}

export type VerificationOutcome = 'VALID' | 'CHECKED_IN' | 'DUPLICATE' | 'NOT_FOUND' | 'INVALID';

export interface VerificationLog {
  id: string;
  ticketNumber: string;
  ticketInstanceId: string | null;
  method: VerificationMethod;
  action: 'VERIFY' | 'CHECK_IN';
  outcome: VerificationOutcome;
  message: string;
  createdAt: string;
  admin: { id: string; name: string; email: string; role: string } | null;
}

export const VERIFICATION_OUTCOMES: { value: VerificationOutcome; label: string }[] = [
  { value: 'CHECKED_IN', label: 'Checked in' },
  { value: 'VALID', label: 'Valid' },
  { value: 'DUPLICATE', label: 'Already checked in' },
  { value: 'NOT_FOUND', label: 'Not found' },
  { value: 'INVALID', label: 'Invalid' },
];

export async function listVerificationLogs(params: {
  page: number;
  limit: number;
  search?: string;
  method?: VerificationMethod;
  outcome?: VerificationOutcome;
  adminId?: string;
}): Promise<ApiListResponse<VerificationLog>> {
  const res = await api.get('/api/admin/verification-logs', { params });
  return res.data;
}
