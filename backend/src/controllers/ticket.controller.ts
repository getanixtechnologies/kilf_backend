import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPaginationParams } from '../utils/pagination';
import * as ticketService from '../services/ticket.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const { festivalId, status, search } = req.query as Record<string, string | undefined>;
  const result = await ticketService.listTickets({
    page,
    limit,
    festivalId,
    status: status as any,
    search,
  });
  return sendSuccess(res, result.items, 'Tickets fetched', 200, result.pagination);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.getTicketWithInventory(req.params.id);
  return sendSuccess(res, ticket, 'Ticket fetched');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.createTicket(req.body);
  await recordAuditLogFromRequest(req, 'CREATED_TICKET', 'Ticket', ticket.id, null, ticket);
  return sendSuccess(res, ticket, 'Ticket created', 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const before = await ticketService.getTicket(req.params.id);
  const ticket = await ticketService.updateTicket(req.params.id, req.body);
  await recordAuditLogFromRequest(req, 'UPDATED_TICKET', 'Ticket', ticket.id, before, ticket);
  return sendSuccess(res, ticket, 'Ticket updated');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const before = await ticketService.getTicket(req.params.id);
  await ticketService.deleteTicket(req.params.id);
  await recordAuditLogFromRequest(req, 'DELETED_TICKET', 'Ticket', req.params.id, before, null);
  return sendSuccess(res, null, 'Ticket deleted');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const before = await ticketService.getTicket(req.params.id);
  const ticket = await ticketService.updateStatus(req.params.id, req.body.status);
  await recordAuditLogFromRequest(
    req,
    'CHANGED_TICKET_STATUS',
    'Ticket',
    ticket.id,
    { status: before.status },
    { status: ticket.status }
  );
  return sendSuccess(res, ticket, 'Ticket status updated');
});

// ---- Public ----

export const publicList = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const { festivalId } = req.query as Record<string, string | undefined>;
  const result = await ticketService.listPublicTickets({ page, limit, festivalId });
  return sendSuccess(res, result.items, 'Tickets fetched', 200, result.pagination);
});

export const publicGetOne = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.getPublicTicket(req.params.id);
  return sendSuccess(res, ticket, 'Ticket fetched');
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const before = await ticketService.getTicket(req.params.id);
  const ticket = await ticketService.archiveTicket(req.params.id);
  await recordAuditLogFromRequest(req, 'ARCHIVED_TICKET', 'Ticket', ticket.id, before, ticket);
  return sendSuccess(res, ticket, 'Ticket archived');
});
