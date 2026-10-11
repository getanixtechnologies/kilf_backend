import { EnquiryStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPaginationParams } from '../utils/pagination';
import * as enquiryService from '../services/enquiry.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await enquiryService.create(req.body);
  return sendSuccess(res, result, 'Enquiry submitted successfully', 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = getPaginationParams(req);
  const { status, search } = req.query as Record<string, string | undefined>;
  const result = await enquiryService.list({ page, limit, status: status as EnquiryStatus | undefined, search });
  return sendSuccess(res, result.items, 'Enquiries fetched', 200, result.pagination);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await enquiryService.getById(req.params.id), 'Enquiry fetched');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const before = await enquiryService.getById(req.params.id);
  const enquiry = await enquiryService.updateStatus(req.params.id, req.body.status);
  await recordAuditLogFromRequest(req, 'UPDATED_ENQUIRY_STATUS', 'Enquiry', enquiry.id, before, enquiry);
  return sendSuccess(res, enquiry, 'Enquiry status updated');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const before = await enquiryService.remove(req.params.id);
  await recordAuditLogFromRequest(req, 'DELETED_ENQUIRY', 'Enquiry', req.params.id, before, null);
  return sendSuccess(res, null, 'Enquiry deleted');
});
