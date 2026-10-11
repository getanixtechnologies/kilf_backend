import { EarlyBirdType } from '@prisma/client';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPaginationParams } from '../utils/pagination';
import * as earlyBirdService from '../services/earlyBird.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await earlyBirdService.register(req.body);
  return sendSuccess(res, result, "You're on the early bird list!", 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const { search, ageGroup, interest, interestType } = req.query as Record<string, string | undefined>;
  const result = await earlyBirdService.list({ page, limit, search, ageGroup, interest, interestType: interestType as EarlyBirdType | undefined });
  return sendSuccess(res, result.items, 'Early bird registrations fetched', 200, result.pagination);
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const { search, ageGroup, interest, interestType } = req.query as Record<string, string | undefined>;
  const csv = await earlyBirdService.exportCsv({ search, ageGroup, interest, interestType: interestType as EarlyBirdType | undefined });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="early-bird-registrations.csv"');
  return res.status(200).send(csv);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const before = await earlyBirdService.remove(req.params.id);
  await recordAuditLogFromRequest(req, 'DELETED_EARLY_BIRD', 'EarlyBirdRegistration', req.params.id, before, null);
  return sendSuccess(res, null, 'Registration deleted');
});
