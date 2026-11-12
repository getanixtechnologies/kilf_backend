/**
 * KILF website: guest account API (bookings history + profile).
 * Drop this file into the website frontend (e.g. src/services/guestApi.ts).
 *
 * Set API_BASE_URL to the backend origin (e.g. import.meta.env.VITE_API_URL
 * or process.env.NEXT_PUBLIC_API_URL).
 */

export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:5000';

// ===================================================================
// Types (exactly what the backend returns)
// ===================================================================

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  pagination?: Pagination;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  errors: { path: string; message: string }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'PAYMENT_REVIEW';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type TicketInstanceStatus = 'VALID' | 'USED' | 'CANCELLED';

export interface TicketInstance {
  ticketNumber: string;
  /** data:image/png;base64,... — render with <img src={qrCode} />. Scannable by the Checker Dashboard. */
  qrCode: string;
  status: TicketInstanceStatus;
  attendee: { name: string; validDate: string | null } | null;
  /** null when the ticket is not a show ticket */
  showSession: { name: string; startTime: string } | null;
}

export interface Booking {
  bookingNumber: string;
  status: BookingStatus;
  quantity: number;
  /** Decimal strings, e.g. "1000" — use Number(x) to format */
  subtotalAmount: string;
  gstAmount: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  ticket: { name: string } | null;
  festival: { name: string; startDate: string; endDate: string };
  /** null for free bookings */
  payment: {
    status: PaymentStatus;
    method: string | null;
    razorpayPaymentId: string | null;
    paidAt: string | null;
  } | null;
  customer: { name: string; email: string; phone: string | null };
  /** Empty until the booking is CONFIRMED */
  ticketInstances: TicketInstance[];
}

export interface UpdateProfileInput {
  name: string;
  /** Optional. "" or null clears it; omit to keep current. Must match ^[0-9+ ]{10,15}$ */
  phone?: string | null;
}

// ===================================================================
// Token storage (replace with your existing auth store if you have one)
// ===================================================================

const ACCESS_KEY = 'kilf_guest_token';
const REFRESH_KEY = 'kilf_guest_refresh';

export const tokens = {
  get access() { return localStorage.getItem(ACCESS_KEY); },
  get refresh() { return localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ===================================================================
// Error class
// ===================================================================

export class ApiError extends Error {
  status: number;
  /** Field errors keyed without the "body." prefix: { name: '...', phone: '...' } */
  fieldErrors: Record<string, string>;
  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message || 'Something went wrong');
    this.status = status;
    this.fieldErrors = {};
    for (const e of body.errors ?? []) {
      this.fieldErrors[e.path.replace(/^body\./, '')] = e.message;
    }
  }
}

// ===================================================================
// Core request with refresh-and-retry-once on 401
// ===================================================================

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    tokens.clear();
    return false;
  }
  const json = (await res.json()) as ApiSuccess<{ token: string; refreshToken: string }>;
  tokens.set(json.data.token, json.data.refreshToken);
  return true;
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: 'required' | 'optional' } = {},
  retried = false
): Promise<ApiSuccess<T>> {
  const { auth = 'required', ...rest } = init;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(rest.headers as any) };
  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));

  if (res.status === 401 && access && !retried) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) return request<T>(path, init, true);
    if (auth === 'optional') return request<T>(path, init, true); // tokens cleared → retry as anonymous
  }

  if (!res.ok) throw new ApiError(res.status, body);
  return body as ApiSuccess<T>;
}

// ===================================================================
// API calls
// ===================================================================

/** GET /api/auth/me */
export async function getMe(): Promise<Guest> {
  return (await request<Guest>('/api/auth/me')).data;
}

/** PATCH /api/auth/me — 400 → err.fieldErrors.name / err.fieldErrors.phone */
export async function updateMe(input: UpdateProfileInput): Promise<Guest> {
  return (await request<Guest>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(input) })).data;
}

/** GET /api/auth/bookings — newest first */
export async function getMyBookings(page = 1, limit = 20): Promise<{ bookings: Booking[]; pagination: Pagination }> {
  const res = await request<Booking[]>(`/api/auth/bookings?page=${page}&limit=${limit}`);
  return { bookings: res.data, pagination: res.pagination! };
}

/** GET /api/auth/bookings/:bookingNumber — 404 if missing or not yours */
export async function getMyBooking(bookingNumber: string): Promise<Booking> {
  return (await request<Booking>(`/api/auth/bookings/${encodeURIComponent(bookingNumber)}`)).data;
}

/**
 * POST /api/bookings — same body as before. If the guest is logged in the
 * token is sent automatically and the booking is saved to their account.
 * Works logged-out too.
 */
export async function createBooking(body: unknown) {
  return (await request<{ booking: any; payment?: any }>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: 'optional',
  })).data;
}

// ===================================================================
// Client-side validation (same rules as the backend)
// ===================================================================

export function validateProfile(input: UpdateProfileInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.name?.trim() ?? '';
  if (name.length < 2) errors.name = 'Name must be at least 2 characters long';
  else if (name.length > 100) errors.name = 'Name must be at most 100 characters long';
  const phone = input.phone?.trim();
  if (phone && !/^[0-9+ ]{10,15}$/.test(phone)) {
    errors.phone = 'Phone must be 10-15 characters: digits, + or spaces';
  }
  return errors;
}

// ===================================================================
// Example responses (for mocks / reference)
// ===================================================================

export const EXAMPLE_ME_RESPONSE: ApiSuccess<Guest> = {
  success: true,
  message: 'Profile fetched',
  data: {
    id: '7c1e2a9e-1f2b-4c1a-9d1e-1a2b3c4d5e6f',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+91 98765 43210',
    isActive: true,
    lastLoginAt: '2026-11-10T08:30:00.000Z',
    createdAt: '2026-10-02T10:00:00.000Z',
  },
};

export const EXAMPLE_BOOKING: Booking = {
  bookingNumber: 'KILF-2026-123456',
  status: 'CONFIRMED',
  quantity: 2,
  subtotalAmount: '1000',
  gstAmount: '180',
  totalAmount: '1180',
  currency: 'INR',
  createdAt: '2026-11-10T09:15:00.000Z',
  ticket: { name: 'Day Pass' },
  festival: { name: 'KILF 2026', startDate: '2026-12-10T00:00:00.000Z', endDate: '2026-12-14T00:00:00.000Z' },
  payment: {
    status: 'SUCCESS',
    method: 'upi',
    razorpayPaymentId: 'pay_P1a2b3c4d5e6f7',
    paidAt: '2026-11-10T09:16:02.000Z',
  },
  customer: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210' },
  ticketInstances: [
    {
      ticketNumber: 'KILF-T-000123',
      qrCode: 'data:image/png;base64,iVBORw0KGgo...',
      status: 'VALID',
      attendee: { name: 'Jane Doe', validDate: '2026-12-11T00:00:00.000Z' },
      showSession: null,
    },
  ],
};

export const EXAMPLE_BOOKINGS_RESPONSE: ApiSuccess<Booking[]> = {
  success: true,
  message: 'Bookings fetched',
  data: [EXAMPLE_BOOKING],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

export const EXAMPLE_VALIDATION_ERROR: ApiErrorBody = {
  success: false,
  message: 'Validation failed',
  errors: [{ path: 'body.phone', message: 'Phone must be 10-15 characters: digits, + or spaces' }],
};
