import { api } from './api';
import { ApiItemResponse, ApiListResponse, Ticket, TicketSaleStatus, TicketType } from '@/types';

export interface TicketListParams {
  page?: number;
  limit?: number;
  festivalId?: string;
  status?: TicketSaleStatus;
  ticketType?: TicketType;
  search?: string;
}

export async function listTickets(params: TicketListParams): Promise<ApiListResponse<Ticket>> {
  const res = await api.get('/api/admin/tickets', { params });
  return res.data;
}

export async function getTicket(id: string): Promise<Ticket> {
  const res = await api.get<ApiItemResponse<Ticket>>(`/api/admin/tickets/${id}`);
  return res.data.data;
}

export interface TicketInput {
  festivalId?: string;
  name: string;
  description?: string;
  ticketType: TicketType;
  price: number;
  totalQuantity: number;
  salesStart: string;
  salesEnd: string;
  status?: TicketSaleStatus;
  gstRate?: number;
  requiresDate?: boolean;
  requiresShowSession?: boolean;
  minAge?: number | null;
  maxAge?: number | null;
  multiDay?: boolean;
  perks?: string[];
}

export async function createTicket(input: TicketInput): Promise<Ticket> {
  const res = await api.post<ApiItemResponse<Ticket>>('/api/admin/tickets', input);
  return res.data.data;
}

export async function updateTicket(id: string, input: Partial<TicketInput>): Promise<Ticket> {
  const res = await api.put<ApiItemResponse<Ticket>>(`/api/admin/tickets/${id}`, input);
  return res.data.data;
}

export async function deleteTicket(id: string): Promise<void> {
  await api.delete(`/api/admin/tickets/${id}`);
}

export async function archiveTicket(id: string): Promise<void> {
  await api.post(`/api/admin/tickets/${id}/archive`);
}

export async function updateTicketStatus(id: string, status: TicketSaleStatus): Promise<Ticket> {
  const res = await api.patch<ApiItemResponse<Ticket>>(`/api/admin/tickets/${id}/status`, { status });
  return res.data.data;
}
