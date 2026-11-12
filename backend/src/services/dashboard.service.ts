import { prisma } from '../config/prisma';
import * as revenueRepository from '../repositories/revenue.repository';
import { round2, toNumber } from './revenue.service';

function startOfDay(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfWeek(d = new Date()) {
  const date = startOfDay(d);
  const day = date.getDay();
  const diff = (day + 6) % 7; // week starts Monday
  date.setDate(date.getDate() - diff);
  return date;
}
function startOfMonth(d = new Date()) {
  const date = startOfDay(d);
  date.setDate(1);
  return date;
}

async function revenueSince(date: Date): Promise<number> {
  const { grossRevenue } = await revenueRepository.getGrossAndRefunds({ createdAt: { gte: date } });
  return round2(toNumber(grossRevenue));
}

/** Per-ticket slot, booking, revenue and check-in breakdown. */
async function getTicketBreakdown() {
  const [tickets, items, checkedIn, issued] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { festival: { select: { id: true, name: true } } },
    }),
    prisma.bookingItem.findMany({
      select: { ticketId: true, quantity: true, subtotal: true, booking: { select: { status: true } } },
    }),
    prisma.ticketInstance.groupBy({ by: ['ticketId'], where: { status: 'USED' }, _count: { _all: true } }),
    prisma.ticketInstance.groupBy({
      by: ['ticketId'],
      where: { status: { not: 'CANCELLED' }, booking: { status: 'CONFIRMED' } },
      _count: { _all: true },
    }),
  ]);

  const checkedInById = new Map(checkedIn.map((c) => [c.ticketId, c._count._all]));
  const issuedById = new Map(issued.map((c) => [c.ticketId, c._count._all]));

  return tickets.map((t) => {
    const mine = items.filter((i) => i.ticketId === t.id);
    const withStatus = (...statuses: string[]) => mine.filter((i) => statuses.includes(i.booking.status));
    const qty = (rows: typeof mine) => rows.reduce((acc, i) => acc + i.quantity, 0);

    const confirmed = withStatus('CONFIRMED');
    const pending = withStatus('PENDING_PAYMENT');
    const issuedCount = issuedById.get(t.id) ?? 0;
    const checkedInCount = checkedInById.get(t.id) ?? 0;
    const remaining = Math.min(Math.max(t.availableQuantity, 0), t.totalQuantity);
    const held = t.totalQuantity - remaining;

    return {
      id: t.id,
      name: t.name,
      festival: t.festival,
      price: toNumber(t.price),
      status: t.status,
      totalQuantity: t.totalQuantity,
      remaining,
      confirmedQuantity: qty(confirmed),
      pendingQuantity: qty(pending),
      utilizationPercentage: t.totalQuantity > 0 ? round2((held / t.totalQuantity) * 100) : 0,
      bookings: {
        total: mine.length,
        confirmed: confirmed.length,
        pending: pending.length,
        cancelled: withStatus('CANCELLED', 'EXPIRED').length,
        refunded: withStatus('REFUNDED').length,
      },
      revenue: round2(confirmed.reduce((acc, i) => acc + toNumber(i.subtotal), 0)),
      checkIn: {
        issued: issuedCount,
        checkedIn: checkedInCount,
        notArrived: issuedCount - checkedInCount,
      },
    };
  });
}

async function getCheckInSummary() {
  const [checkedIn, issued, recent] = await Promise.all([
    prisma.ticketInstance.count({ where: { status: 'USED' } }),
    prisma.ticketInstance.count({ where: { status: { not: 'CANCELLED' }, booking: { status: 'CONFIRMED' } } }),
    prisma.ticketInstance.findMany({
      where: { status: 'USED' },
      orderBy: { checkedInAt: 'desc' },
      take: 10,
      select: {
        id: true,
        ticketNumber: true,
        checkedInAt: true,
        ticket: { select: { name: true } },
        booking: { select: { bookingNumber: true, customer: { select: { name: true } } } },
        checkedInBy: { select: { name: true } },
      },
    }),
  ]);
  return { issued, checkedIn, notArrived: issued - checkedIn, recent };
}

export async function getDashboardStats() {
  const [
    ticketAgg,
    bookingCounts,
    sponsorCounts,
    { grossRevenue, refunds },
    ticketsSold,
    todayRevenue,
    weekRevenue,
    monthRevenue,
    dailyRevenue,
    monthlyRevenue,
    revenueByTicket,
    ticketBreakdown,
    checkInSummary,
  ] = await Promise.all([
    prisma.ticket.aggregate({ _sum: { totalQuantity: true, availableQuantity: true } }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.sponsor.groupBy({ by: ['status'], _count: { _all: true } }),
    revenueRepository.getGrossAndRefunds(),
    revenueRepository.getTicketsSoldCount(),
    revenueSince(startOfDay()),
    revenueSince(startOfWeek()),
    revenueSince(startOfMonth()),
    revenueRepository.getDailyRevenue(14),
    revenueRepository.getMonthlyRevenue(12),
    revenueRepository.getRevenueByTicket(),
    getTicketBreakdown(),
    getCheckInSummary(),
  ]);

  const totalTickets = ticketAgg._sum.totalQuantity ?? 0;
  const availableTickets = ticketAgg._sum.availableQuantity ?? 0;
  const soldTickets = totalTickets - availableTickets;

  const bookingsByStatus = Object.fromEntries(
    bookingCounts.map((b) => [b.status, b._count._all])
  ) as Record<string, number>;
  const totalBookings = bookingCounts.reduce((sum, b) => sum + b._count._all, 0);

  const sponsorsByStatus = Object.fromEntries(
    sponsorCounts.map((s) => [s.status, s._count._all])
  ) as Record<string, number>;
  const totalSponsors = sponsorCounts.reduce((sum, s) => sum + s._count._all, 0);

  const gross = round2(toNumber(grossRevenue));
  const refundTotal = round2(toNumber(refunds));

  return {
    tickets: {
      total: totalTickets,
      sold: soldTickets,
      available: availableTickets,
      utilizationPercentage: totalTickets > 0 ? round2((soldTickets / totalTickets) * 100) : 0,
    },
    bookings: {
      total: totalBookings,
      confirmed: bookingsByStatus.CONFIRMED ?? 0,
      pending: bookingsByStatus.PENDING_PAYMENT ?? 0,
      cancelled: bookingsByStatus.CANCELLED ?? 0,
      refunded: bookingsByStatus.REFUNDED ?? 0,
      expired: bookingsByStatus.EXPIRED ?? 0,
    },
    revenue: {
      total: gross,
      refunds: refundTotal,
      net: round2(gross - refundTotal),
      today: todayRevenue,
      thisWeek: weekRevenue,
      thisMonth: monthRevenue,
      ticketsSold,
    },
    sponsors: {
      total: totalSponsors,
      active: sponsorsByStatus.ACTIVE ?? 0,
    },
    ticketBreakdown,
    checkIn: checkInSummary,
    charts: {
      revenueByDay: dailyRevenue.map((r) => ({
        date: r.day,
        revenue: round2(Number(r.grossRevenue)),
        transactions: Number(r.transactions),
      })),
      revenueByMonth: monthlyRevenue.map((r) => ({
        month: r.month,
        revenue: round2(Number(r.grossRevenue)),
        transactions: Number(r.transactions),
      })),
      revenueByTicket: revenueByTicket.map((r) => ({
        name: r.name,
        quantitySold: r.quantity,
        revenue: round2(toNumber(r.revenue)),
      })),
    },
  };
}
