import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as scannerService from '../services/scanner.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, await scannerService.listScanners(), 'Checkers fetched');
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await scannerService.createScanner(req.body);
  await recordAuditLogFromRequest(req, 'CREATED_SCANNER', 'Admin', result.scanner.id, null, {
    email: result.scanner.email,
    emailSent: result.emailSent,
  });
  return sendSuccess(
    res,
    result,
    result.emailSent ? 'Checker created and credentials emailed' : 'Checker created; email could not be sent',
    201
  );
});

export const resendCredentials = asyncHandler(async (req: Request, res: Response) => {
  const result = await scannerService.resendCredentials(String(req.params.id));
  await recordAuditLogFromRequest(req, 'RESENT_SCANNER_CREDENTIALS', 'Admin', result.scanner.id, null, {
    emailSent: result.emailSent,
  });
  return sendSuccess(
    res,
    result,
    result.emailSent ? 'New credentials emailed' : 'Password reset; email could not be sent'
  );
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { password, ...rest } = req.body;
  const scanner = await scannerService.updateScanner(String(req.params.id), req.body);
  await recordAuditLogFromRequest(req, 'UPDATED_SCANNER', 'Admin', scanner.id, null, {
    ...rest,
    passwordChanged: password !== undefined,
  });
  return sendSuccess(res, scanner, 'Checker updated');
});
