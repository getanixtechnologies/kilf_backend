import { Prisma, BookingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface BookingListFilters {
  status?: BookingStatus;
  ticketId?: string;
  festivalId?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  skip: number;
  take: number;
}

const listInclude = {
  customer: true,
  festival: { select: { id: true, name: true } },
  bookingItems: {
    include: {
      ticket: { select: { id: true, name: true } },
      attendees: { include: { showSession: { select: { id: true, name: true, startsAt: true } } } },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

function buildWhere(
  filters: Pick<BookingListFilters, 'status' | 'ticketId' | 'festivalId' | 'search' | 'dateFrom' | 'dateTo'>
): Prisma.BookingWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.festivalId ? { festivalId: filters.festivalId } : {}),
    ...(filters.ticketId ? { bookingItems: { some: { ticketId: filters.ticketId } } } : {}),
    ...(filters.search
      ? {
          OR: [
            { bookingNumber: { contains: filters.search, mode: 'insensitive' } },
            { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
            { customer: { email: { contains: filters.search, mode: 'insensitive' } } },
            { customer: { phone: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };
}

export async function findMany(filters: BookingListFilters) {
  const where = buildWhere(filters);
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      orderBy: { createdAt: 'desc' },
      include: listInclude,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

export async function findAllForExport(filters: Omit<BookingListFilters, 'skip' | 'take'>) {
  const where = buildWhere(filters);
  return prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, include: listInclude });
}

export async function findById(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      ...listInclude,
      payments: { orderBy: { createdAt: 'desc' } },
      ticketInstances: true,
    },
  });
}

export async function findByBookingNumber(bookingNumber: string) {
  return prisma.booking.findUnique({
    where: { bookingNumber },
    include: {
      ...listInclude,
      payments: { orderBy: { createdAt: 'desc' } },
      ticketInstances: true,
    },
  });
}
