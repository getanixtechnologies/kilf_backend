import { Prisma, TicketSaleStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface TicketListFilters {
  festivalId?: string;
  status?: TicketSaleStatus;
  search?: string;
  skip: number;
  take: number;
}

function buildWhere(
  filters: Pick<TicketListFilters, 'festivalId' | 'status' | 'search'>
): Prisma.TicketWhereInput {
  return {
    archivedAt: null,
    ...(filters.festivalId ? { festivalId: filters.festivalId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
  };
}

export async function findMany(filters: TicketListFilters) {
  const where = buildWhere(filters);
  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      orderBy: { createdAt: 'desc' },
      include: { festival: { select: { id: true, name: true } } },
    }),
    prisma.ticket.count({ where }),
  ]);
  return { items, total };
}

export async function findById(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: { festival: { select: { id: true, name: true } } },
  });
}

export async function create(data: Prisma.TicketUncheckedCreateInput) {
  return prisma.ticket.create({ data });
}

export async function update(id: string, data: Prisma.TicketUpdateInput) {
  return prisma.ticket.update({ where: { id }, data });
}

export async function remove(id: string) {
  return prisma.ticket.delete({ where: { id } });
}

/** Sold = totalQuantity - availableQuantity, plus per-ticket revenue from CONFIRMED bookings. */
export async function getTicketRevenue(ticketId: string) {
  const result = await prisma.bookingItem.aggregate({
    where: {
      ticketId,
      booking: { status: 'CONFIRMED' },
    },
    _sum: { subtotal: true, quantity: true },
  });
  return {
    ticketsSold: result._sum.quantity ?? 0,
    revenue: result._sum.subtotal ?? new Prisma.Decimal(0),
  };
}
