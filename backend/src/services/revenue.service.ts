import { Prisma } from '@prisma/client';
import * as revenueRepository from '../repositories/revenue.repository';

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export async function getRevenueSummary() {
  const { grossRevenue, refunds } = await revenueRepository.getGrossAndRefunds();
  const ticketsSold = await revenueRepository.getTicketsSoldCount();

  const gross = toNumber(grossRevenue);
  const refundTotal = toNumber(refunds);
  const net = gross - refundTotal;
  const averageTicketValue = ticketsSold > 0 ? gross / ticketsSold : 0;

  return {
    grossRevenue: round2(gross),
    refunds: round2(refundTotal),
    netRevenue: round2(net),
    ticketsSold,
    averageTicketValue: round2(averageTicketValue),
  };
}

export async function getDailyRevenue(days = 30) {
  const rows = await revenueRepository.getDailyRevenue(days);
  return rows.map((r) => ({
    date: r.day,
    grossRevenue: round2(Number(r.grossRevenue)),
    transactions: Number(r.transactions),
  }));
}

export async function getMonthlyRevenue(months = 12) {
  const rows = await revenueRepository.getMonthlyRevenue(months);
  return rows.map((r) => ({
    month: r.month,
    grossRevenue: round2(Number(r.grossRevenue)),
    transactions: Number(r.transactions),
  }));
}

export async function getRevenueByTicket() {
  const rows = await revenueRepository.getRevenueByTicket();
  return rows.map((r) => ({
    ticketId: r.ticketId,
    name: r.name,
    quantitySold: r.quantity,
    revenue: round2(toNumber(r.revenue)),
  }));
}

export async function getRevenueByPaymentStatus() {
  const rows = await revenueRepository.getRevenueByPaymentStatus();
  return rows.map((r) => ({ status: r.status, amount: round2(toNumber(r.amount)), count: r.count }));
}

export async function getRevenueByFestival() {
  const rows = await revenueRepository.getRevenueByFestival();
  return rows.map((r) => ({
    festivalId: r.festivalId,
    name: r.name,
    revenue: round2(toNumber(r.revenue)),
  }));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export { toNumber, round2 };
