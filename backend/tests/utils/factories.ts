import { AdminRole, TicketType } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { hashPassword } from '../../src/utils/password';
import { signAccessToken } from '../../src/utils/jwt';

export async function createAdmin(overrides: Partial<{ email: string; password: string; role: AdminRole }> = {}) {
  const email = overrides.email ?? `admin.${Date.now()}.${Math.random().toString(36).slice(2)}@kilf.dev`;
  const password = overrides.password ?? 'Password@123';
  const admin = await prisma.admin.create({
    data: {
      name: 'Test Admin',
      email,
      passwordHash: await hashPassword(password),
      role: overrides.role ?? 'ADMIN',
    },
  });
  const token = signAccessToken(admin);
  return { admin, password, token };
}

export async function createFestival(overrides: Partial<Parameters<typeof prisma.festival.create>[0]['data']> = {}) {
  return prisma.festival.create({
    data: {
      name: 'Test Festival',
      description: 'A festival for testing',
      location: 'Test City',
      venue: 'Test Venue',
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000),
      status: 'PUBLISHED',
      ...overrides,
    },
  });
}

export async function createTicket(
  festivalId: string,
  overrides: Partial<{
    name: string;
    ticketType: TicketType;
    price: number;
    totalQuantity: number;
    availableQuantity: number;
    salesStart: Date;
    salesEnd: Date;
    status: 'ACTIVE' | 'INACTIVE';
    gstRate: number;
    requiresDate: boolean;
    requiresShowSession: boolean;
    minAge: number;
    maxAge: number;
    multiDay: boolean;
    validityDays: number;
    idPrefix: string;
  }> = {}
) {
  const totalQuantity = overrides.totalQuantity ?? 100;
  return prisma.ticket.create({
    data: {
      festivalId,
      name: overrides.name ?? 'General Admission',
      description: 'Test ticket',
      ticketType: overrides.ticketType ?? 'GENERAL',
      price: overrides.price ?? 500,
      totalQuantity,
      availableQuantity: overrides.availableQuantity ?? totalQuantity,
      salesStart: overrides.salesStart ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
      salesEnd: overrides.salesEnd ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: overrides.status ?? 'ACTIVE',
      // Tests assert on plain prices, so GST is off unless a test opts in.
      gstRate: overrides.gstRate ?? 0,
      requiresDate: overrides.requiresDate ?? false,
      requiresShowSession: overrides.requiresShowSession ?? false,
      minAge: overrides.minAge,
      maxAge: overrides.maxAge,
      multiDay: overrides.multiDay ?? false,
      validityDays: overrides.validityDays,
      idPrefix: overrides.idPrefix,
    },
  });
}

export async function createShowSession(
  festivalId: string,
  overrides: Partial<{ totalSeats: number; availableSeats: number; startsAt: Date }> = {}
) {
  const totalSeats = overrides.totalSeats ?? 10;
  return prisma.showSession.create({
    data: {
      festivalId,
      name: 'Khasakkinte Ithihasam',
      venue: 'Test Hall',
      startsAt: overrides.startsAt ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      totalSeats,
      availableSeats: overrides.availableSeats ?? totalSeats,
    },
  });
}

/** `count` attendee entries for a booking request body. */
export function attendees(count: number) {
  return Array.from({ length: count }, (_, i) => ({ name: `Guest ${i + 1}` }));
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
