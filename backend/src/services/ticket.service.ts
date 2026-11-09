import { TicketSaleStatus, TicketType } from '@prisma/client';
import * as ticketRepository from '../repositories/ticket.repository';
import { getFestival } from './festival.service';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../config/prisma';
import { buildPagination } from '../utils/apiResponse';

export interface PassRules {
  gstRate: number;
  requiresDate: boolean;
  requiresShowSession: boolean;
  minAge: number | null;
  maxAge: number | null;
  multiDay: boolean;
  perks: string[];
}

/** Rules each pass type implies; anything the admin sends explicitly overrides these. */
const TYPE_PRESETS: Partial<Record<TicketType, Partial<PassRules>>> = {
  DAY_PASS: { requiresDate: true },
  FULL_FESTIVAL: { multiDay: true },
  YOUNG_READER: { multiDay: true },
  ELITE: { multiDay: true, requiresShowSession: true },
  KHASAK_SHOW: { requiresShowSession: true },
  NEW_YEAR_EVE: { gstRate: 0 },
};

function assertPriceMatchesType(ticketType: TicketType, price: number) {
  if (ticketType === 'NEW_YEAR_EVE' && price !== 0) {
    throw ApiError.badRequest("New Year's Eve registration is free; price must be 0");
  }
}

function assertAgeRange(minAge?: number | null, maxAge?: number | null) {
  if (minAge != null && maxAge != null && minAge > maxAge) {
    throw ApiError.badRequest('minAge cannot be greater than maxAge');
  }
}

export interface ListTicketsParams {
  page: number;
  limit: number;
  festivalId?: string;
  status?: TicketSaleStatus;
  ticketType?: TicketType;
  search?: string;
}

export async function listTickets(params: ListTicketsParams) {
  const skip = (params.page - 1) * params.limit;
  const { items, total } = await ticketRepository.findMany({
    festivalId: params.festivalId,
    status: params.status,
    ticketType: params.ticketType,
    search: params.search,
    skip,
    take: params.limit,
  });
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}

export async function getTicket(id: string) {
  const ticket = await ticketRepository.findById(id);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  return ticket;
}

export async function getTicketWithInventory(id: string) {
  const ticket = await getTicket(id);
  const { ticketsSold, revenue } = await ticketRepository.getTicketRevenue(id);
  const utilization = ticket.totalQuantity > 0 ? (ticketsSold / ticket.totalQuantity) * 100 : 0;
  return {
    ...ticket,
    ticketsSold,
    revenue,
    utilizationPercentage: Number(utilization.toFixed(2)),
  };
}

/** Uses the given festival, or falls back to the latest one (most recent start date). */
async function resolveFestivalId(festivalId?: string) {
  if (festivalId) {
    await getFestival(festivalId); // ensures festival exists
    return festivalId;
  }
  const latest = await prisma.festival.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } });
  if (!latest) throw ApiError.badRequest('Create a festival before adding tickets');
  return latest.id;
}

export async function createTicket(data: {
  festivalId?: string;
  name: string;
  description?: string;
  ticketType: TicketType;
  price: number;
  totalQuantity: number;
  salesStart: Date;
  salesEnd: Date;
  status?: TicketSaleStatus;
} & Partial<PassRules>) {
  const festivalId = await resolveFestivalId(data.festivalId);
  assertPriceMatchesType(data.ticketType, data.price);
  assertAgeRange(data.minAge, data.maxAge);
  const preset = TYPE_PRESETS[data.ticketType] ?? {};

  return ticketRepository.create({
    festivalId,
    name: data.name,
    description: data.description,
    ticketType: data.ticketType,
    price: data.price,
    totalQuantity: data.totalQuantity,
    availableQuantity: data.totalQuantity,
    salesStart: data.salesStart,
    salesEnd: data.salesEnd,
    status: data.status ?? 'ACTIVE',
    gstRate: data.gstRate ?? preset.gstRate ?? 18,
    requiresDate: data.requiresDate ?? preset.requiresDate ?? false,
    requiresShowSession: data.requiresShowSession ?? preset.requiresShowSession ?? false,
    minAge: data.minAge ?? null,
    maxAge: data.maxAge ?? null,
    multiDay: data.multiDay ?? preset.multiDay ?? false,
    perks: data.perks ?? [],
  });
}

export async function updateTicket(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    ticketType: TicketType;
    price: number;
    totalQuantity: number;
    salesStart: Date;
    salesEnd: Date;
    status: TicketSaleStatus;
  }> &
    Partial<PassRules>
) {
  const ticket = await getTicket(id);
  assertPriceMatchesType(data.ticketType ?? ticket.ticketType, data.price ?? Number(ticket.price));
  assertAgeRange(data.minAge ?? ticket.minAge, data.maxAge ?? ticket.maxAge);
  const updateData: Record<string, unknown> = { ...data };

  if (data.totalQuantity !== undefined && data.totalQuantity !== ticket.totalQuantity) {
    const sold = ticket.totalQuantity - ticket.availableQuantity;
    const newAvailable = data.totalQuantity - sold;
    if (newAvailable < 0) {
      throw ApiError.badRequest(
        `Cannot reduce total quantity below the ${sold} tickets already sold`
      );
    }
    updateData.availableQuantity = newAvailable;
  }

  return ticketRepository.update(id, updateData);
}

export async function deleteTicket(id: string) {
  const ticket = await getTicket(id);
  const sold = ticket.totalQuantity - ticket.availableQuantity;
  if (sold > 0) {
    throw ApiError.conflict('Cannot delete a ticket that already has bookings');
  }
  return ticketRepository.remove(id);
}

export async function updateStatus(id: string, status: TicketSaleStatus) {
  await getTicket(id);
  return ticketRepository.update(id, { status });
}

// ---- Public ----

export async function listPublicTickets(params: { page: number; limit: number; festivalId?: string }) {
  const skip = (params.page - 1) * params.limit;
  const now = new Date();
  const { items, total } = await ticketRepository.findMany({
    festivalId: params.festivalId,
    status: 'ACTIVE',
    skip,
    take: params.limit,
  });

  const available = items.filter(
    (t) => t.salesStart <= now && t.salesEnd >= now && t.availableQuantity > 0
  );

  return {
    items: available.map(toPublicTicketDto),
    pagination: buildPagination(params.page, params.limit, total),
  };
}

export async function getPublicTicket(id: string) {
  const ticket = await getTicket(id);
  const now = new Date();
  if (
    ticket.status !== 'ACTIVE' ||
    ticket.salesStart > now ||
    ticket.salesEnd < now ||
    ticket.availableQuantity <= 0
  ) {
    throw ApiError.notFound('Ticket not currently available for sale');
  }
  return toPublicTicketDto(ticket);
}

function toPublicTicketDto(ticket: Awaited<ReturnType<typeof ticketRepository.findById>>) {
  if (!ticket) throw ApiError.notFound('Ticket not found');
  return {
    id: ticket.id,
    festivalId: ticket.festivalId,
    name: ticket.name,
    description: ticket.description,
    ticketType: ticket.ticketType,
    price: ticket.price,
    availableQuantity: ticket.availableQuantity,
    salesStart: ticket.salesStart,
    salesEnd: ticket.salesEnd,
    gstRate: ticket.gstRate,
    requiresDate: ticket.requiresDate,
    requiresShowSession: ticket.requiresShowSession,
    minAge: ticket.minAge,
    maxAge: ticket.maxAge,
    multiDay: ticket.multiDay,
    perks: ticket.perks,
  };
}

export async function archiveTicket(id: string) {
  await getTicket(id);
  return ticketRepository.update(id, { archivedAt: new Date(), status: 'INACTIVE' });
}
