export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SCANNER';

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Signed in with a temporary password that must be replaced first. */
  mustChangePassword?: boolean;
}

export type FestivalStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export interface Festival {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  venue: string | null;
  startDate: string;
  endDate: string;
  registrationStart: string | null;
  registrationEnd: string | null;
  bannerImage: string | null;
  status: FestivalStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number; bookings: number; sponsors: number };
}

export type TicketType =
  | 'GENERAL'
  | 'VIP'
  | 'STUDENT'
  | 'EARLY_BIRD'
  | 'DAY_PASS'
  | 'FULL_FESTIVAL'
  | 'YOUNG_READER'
  | 'ELITE'
  | 'KHASAK_SHOW'
  | 'DRAMA'
  | 'NEW_YEAR_EVE';
export type TicketSaleStatus = 'ACTIVE' | 'INACTIVE';

export interface Ticket {
  id: string;
  festivalId: string;
  festival?: { id: string; name: string };
  name: string;
  description: string | null;
  ticketType: TicketType;
  price: string | number;
  totalQuantity: number;
  availableQuantity: number;
  salesStart: string;
  salesEnd: string;
  status: TicketSaleStatus;
  gstRate?: string | number;
  requiresDate?: boolean;
  requiresShowSession?: boolean;
  minAge?: number | null;
  maxAge?: number | null;
  multiDay?: boolean;
  perks?: string[];
  validityDays?: number | null;
  allowReentry?: boolean;
  createdAt: string;
  updatedAt: string;
  ticketsSold?: number;
  revenue?: string | number;
  utilizationPercentage?: number;
}

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED' | 'PAYMENT_REVIEW';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface Payment {
  id: string;
  provider: string;
  /** Gateway order id (order_...). */
  providerPaymentId: string | null;
  /** Gateway payment id of the captured attempt (pay_...). */
  gatewayPaymentId: string | null;
  refundId: string | null;
  method: string | null;
  failureReason: string | null;
  lastCheckedAt: string | null;
  amount: string | number;
  currency: string;
  status: PaymentStatus;
  refundedAmount: string | number;
  createdAt: string;
}

export interface BookingItem {
  id: string;
  ticketId: string;
  ticket: { id: string; name: string; ticketType: TicketType };
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
}

export interface TicketInstance {
  id: string;
  ticketNumber: string;
  qrCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  checkedInAt: string | null;
}

export interface Booking {
  id: string;
  bookingNumber: string;
  festivalId: string;
  festival: { id: string; name: string };
  customer: Customer;
  status: BookingStatus;
  quantity: number;
  totalAmount: string | number;
  currency: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  bookingItems: BookingItem[];
  payments: Payment[];
  ticketInstances?: TicketInstance[];
}

export type SponsorshipLevel = 'TITLE' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'PARTNER';
export type SponsorStatus = 'ACTIVE' | 'INACTIVE';

export interface Sponsor {
  id: string;
  festivalId: string | null;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sponsorshipLevel: SponsorshipLevel;
  amount: string | number | null;
  status: SponsorStatus;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  message: string;
  pagination: Pagination;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface TicketBreakdown {
  id: string;
  name: string;
  ticketType: TicketType;
  festival: { id: string; name: string };
  price: number;
  status: TicketSaleStatus;
  totalQuantity: number;
  remaining: number;
  confirmedQuantity: number;
  pendingQuantity: number;
  utilizationPercentage: number;
  bookings: { total: number; confirmed: number; pending: number; cancelled: number; refunded: number };
  revenue: number;
  checkIn: { issued: number; checkedIn: number; notArrived: number };
}

export interface DashboardStats {
  tickets: { total: number; sold: number; available: number; utilizationPercentage: number };
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    refunded: number;
    expired: number;
  };
  revenue: {
    total: number;
    refunds: number;
    net: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    ticketsSold: number;
  };
  sponsors: { total: number; active: number };
  ticketBreakdown: TicketBreakdown[];
  checkIn: {
    issued: number;
    checkedIn: number;
    notArrived: number;
    recent: {
      id: string;
      ticketNumber: string;
      checkedInAt: string | null;
      ticket: { name: string };
      booking: { bookingNumber: string; customer: { name: string } };
      checkedInBy: { name: string } | null;
    }[];
  };
  charts: {
    revenueByDay: { date: string; revenue: number; transactions: number }[];
    revenueByMonth: { month: string; revenue: number; transactions: number }[];
    revenueByTicketType: { name: string; ticketType: string; quantitySold: number; revenue: number }[];
  };
}

export interface RevenueSummary {
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  ticketsSold: number;
  averageTicketValue: number;
}

export interface AuditLog {
  id: string;
  adminId: string | null;
  admin: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
}
