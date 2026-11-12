import { Request, Response } from 'express';
import { VerificationAction, VerificationMethod, VerificationOutcome } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { getPaginationParams } from '../utils/pagination';
import { TICKET_NUMBER_DIGITS, ticketNumberPrefix } from '../utils/idGenerators';
import * as checkinService from '../services/checkin.service';
import * as verificationLogService from '../services/verificationLog.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

/**
 * The fixed parts of ticket numbers, so the manual-entry box only takes the
 * unique part. `prefix` is the default format; `prefixes` lists it plus one
 * entry per ticket type with a configured ID prefix.
 */
export const numberFormat = asyncHandler(async (_req: Request, res: Response) => {
  const configured = await checkinService.listTicketIdPrefixes();
  const fallback = ticketNumberPrefix();
  const prefixes = [
    ...configured.map((t) => ({ prefix: ticketNumberPrefix(t.idPrefix), label: t.name })),
    { prefix: fallback, label: 'Other tickets' },
  ];
  return sendSuccess(
    res,
    { prefix: fallback, digits: TICKET_NUMBER_DIGITS, example: `${fallback}000123`, prefixes },
    'Ticket number format'
  );
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const { ticketNumber, venue, method } = req.body as { ticketNumber: string; venue?: string; method?: VerificationMethod };
  const result = await checkinService.verifyTicket(ticketNumber, venue);
  const outcome: VerificationOutcome = !result.ticket
    ? 'NOT_FOUND'
    : !result.valid
      ? 'INVALID'
      : result.alreadyUsed
        ? 'DUPLICATE'
        : 'VALID';
  await verificationLogService.recordVerification({
    adminId: req.admin!.id,
    ticketNumber,
    ticketInstanceId: result.ticket?.id,
    method,
    action: 'VERIFY',
    outcome,
    message: result.message,
  });
  return sendSuccess(res, result, result.valid ? 'Ticket verified' : 'Ticket is not valid');
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { ticketNumber, venue, method } = req.body as { ticketNumber: string; venue?: string; method?: VerificationMethod };
  const log = (outcome: VerificationOutcome, message: string, ticketInstanceId?: string) =>
    verificationLogService.recordVerification({
      adminId: req.admin!.id,
      ticketNumber,
      ticketInstanceId,
      method,
      action: 'CHECK_IN' as VerificationAction,
      outcome,
      message,
    });

  let instance;
  try {
    instance = await checkinService.checkInTicket(ticketNumber, req.admin!.id, venue);
  } catch (err) {
    if (err instanceof ApiError) {
      const outcome = err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 409 ? 'DUPLICATE' : 'INVALID';
      await log(outcome, err.message);
    }
    throw err;
  }

  await log('CHECKED_IN', 'Checked in', instance.id);
  await recordAuditLogFromRequest(
    req,
    'CHECKED_IN_TICKET',
    'TicketInstance',
    instance.id,
    null,
    { ticketNumber: instance.ticketNumber, checkedInAt: instance.checkedInAt, method: method ?? 'MANUAL' }
  );
  return sendSuccess(res, instance, 'Attendee checked in successfully');
});

export const listVerificationLogs = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const q = req.query as Record<string, string | undefined>;
  const result = await verificationLogService.list({
    page,
    limit,
    search: q.search || undefined,
    adminId: q.adminId || undefined,
    method: (q.method as VerificationMethod) || undefined,
    action: (q.action as VerificationAction) || undefined,
    outcome: (q.outcome as VerificationOutcome) || undefined,
  });
  return sendSuccess(res, result.items, 'Verification logs fetched', 200, result.pagination);
});
