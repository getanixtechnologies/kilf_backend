import { api } from './api';
import { DashboardStats, RevenueSummary } from '@/types';

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const res = await api.get('/api/admin/revenue/summary');
  return res.data.data;
}

export interface RevenuePoint {
  date?: string;
  month?: string;
  grossRevenue: number;
  transactions: number;
}

export async function getDailyRevenue(days = 30): Promise<RevenuePoint[]> {
  const res = await api.get('/api/admin/revenue/daily', { params: { days } });
  return res.data.data;
}

export async function getMonthlyRevenue(months = 12): Promise<RevenuePoint[]> {
  const res = await api.get('/api/admin/revenue/monthly', { params: { months } });
  return res.data.data;
}

export interface RevenueByTicket {
  ticketId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export async function getRevenueByTicket(): Promise<RevenueByTicket[]> {
  const res = await api.get('/api/admin/revenue/tickets');
  return res.data.data;
}

export interface RevenueByFestival {
  festivalId: string;
  name: string;
  revenue: number;
}

export async function getRevenueByFestival(): Promise<RevenueByFestival[]> {
  const res = await api.get('/api/admin/revenue/festivals');
  return res.data.data;
}

export interface RevenueByPaymentStatus {
  status: string;
  amount: number;
  count: number;
}

export async function getRevenueByPaymentStatus(): Promise<RevenueByPaymentStatus[]> {
  const res = await api.get('/api/admin/revenue/payment-status');
  return res.data.data;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await api.get('/api/admin/dashboard');
  return res.data.data;
}
