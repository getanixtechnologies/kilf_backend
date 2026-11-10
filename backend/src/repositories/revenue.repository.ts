import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/** Payments counted toward gross revenue: successful now, or successful-then-refunded. */
const GROSS_STATUSES: Prisma.PaymentWhereInput['status'] = { in: ['SUCCESS', 'REFUNDED'] };

export async function getGrossAndRefunds(where: Prisma.PaymentWhereInput = {}) {
  const [gross, refunds] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...where, status: GROSS_STATUSES },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...where, status: 'REFUNDED' },
      _sum: { refundedAmount: true },
    }),
  ]);

  return {
    grossRevenue: gross._sum.amount ?? new Prisma.Decimal(0),
    refunds: refunds._sum.refundedAmount ?? new Prisma.Decimal(0),
  };
}

export async function getTicketsSoldCount(festivalId?: string) {
  const result = await prisma.bookingItem.aggregate({
    where: {
      booking: {
        status: { in: ['CONFIRMED', 'REFUNDED'] },
        ...(festivalId ? { festivalId } : {}),
      },
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export interface DailyRevenueRow {
  day: Date;
  grossRevenue: string;
  transactions: bigint;
}

export async function getDailyRevenue(days: number): Promise<DailyRevenueRow[]> {
  return prisma.$queryRaw<DailyRevenueRow[]>`
    SELECT date_trunc('day', "created_at") AS day,
           COALESCE(SUM("amount"), 0)::text AS "grossRevenue",
           COUNT(*)::bigint AS transactions
    FROM payments
    WHERE status IN ('SUCCESS', 'REFUNDED')
      AND "created_at" >= NOW() - (${days}::text || ' days')::interval
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export interface MonthlyRevenueRow {
  month: Date;
  grossRevenue: string;
  transactions: bigint;
}

export async function getMonthlyRevenue(months: number): Promise<MonthlyRevenueRow[]> {
  return prisma.$queryRaw<MonthlyRevenueRow[]>`
    SELECT date_trunc('month', "created_at") AS month,
           COALESCE(SUM("amount"), 0)::text AS "grossRevenue",
           COUNT(*)::bigint AS transactions
    FROM payments
    WHERE status IN ('SUCCESS', 'REFUNDED')
      AND "created_at" >= NOW() - (${months}::text || ' months')::interval
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export async function getRevenueByTicket() {
  const items = await prisma.bookingItem.findMany({
    where: { booking: { status: { in: ['CONFIRMED', 'REFUNDED'] } } },
    select: { quantity: true, subtotal: true, ticket: { select: { name: true, id: true } } },
  });

  const map = new Map<string, { ticketId: string; name: string; quantity: number; revenue: Prisma.Decimal }>();
  for (const item of items) {
    const key = item.ticket.id;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue = existing.revenue.add(item.subtotal);
    } else {
      map.set(key, {
        ticketId: item.ticket.id,
        name: item.ticket.name,
        quantity: item.quantity,
        revenue: item.subtotal,
      });
    }
  }
  return Array.from(map.values());
}

export async function getRevenueByPaymentStatus() {
  const grouped = await prisma.payment.groupBy({
    by: ['status'],
    _sum: { amount: true },
    _count: { _all: true },
  });
  return grouped.map((g) => ({
    status: g.status,
    amount: g._sum.amount ?? new Prisma.Decimal(0),
    count: g._count._all,
  }));
}

export async function getRevenueByFestival() {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['CONFIRMED', 'REFUNDED'] } },
    select: { totalAmount: true, festival: { select: { id: true, name: true } } },
  });
  const map = new Map<string, { festivalId: string; name: string; revenue: Prisma.Decimal }>();
  for (const b of bookings) {
    const existing = map.get(b.festival.id);
    if (existing) {
      existing.revenue = existing.revenue.add(b.totalAmount);
    } else {
      map.set(b.festival.id, { festivalId: b.festival.id, name: b.festival.name, revenue: b.totalAmount });
    }
  }
  return Array.from(map.values());
}
