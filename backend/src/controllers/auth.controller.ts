import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as authService from '../services/auth.service';
import { recordAuditLogFromRequest } from '../services/auditLog.service';
import { isProduction } from '../config/env';

export const bootstrapAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, admin } = await authService.bootstrapAdmin(req.body);
  await recordAuditLogFromRequest(req, 'BOOTSTRAP_ADMIN', 'Admin', admin.id, null, admin);
  return res.status(201).json({
    success: true,
    token: accessToken,
    refreshToken,
    admin,
    message: 'Admin account created',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, admin } = await authService.login(req.body);
  await recordAuditLogFromRequest(req, 'ADMIN_LOGIN', 'Admin', admin.id);
  // Login intentionally returns token/admin at the top level (not nested
  // under `data`) to match the documented admin login response shape.
  return res.status(200).json({
    success: true,
    token: accessToken,
    refreshToken,
    admin,
    message: 'Login successful',
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken } = await authService.refresh(req.body.refreshToken);
  return sendSuccess(res, { token: accessToken, refreshToken }, 'Token refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.admin!.id);
  await recordAuditLogFromRequest(req, 'ADMIN_LOGOUT', 'Admin', req.admin!.id);
  return sendSuccess(res, null, 'Logged out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await authService.getProfile(req.admin!.id);
  return sendSuccess(res, admin, 'Profile fetched');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.changePassword(req.admin!.id, req.body);
  await recordAuditLogFromRequest(req, 'ADMIN_CHANGE_PASSWORD', 'Admin', req.admin!.id);
  return sendSuccess(res, session, 'Password changed successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const token = await authService.forgotPassword(req.body.email);
  return sendSuccess(
    res,
    isProduction ? null : { resetToken: token },
    'If that email is registered, a reset link has been sent'
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  return sendSuccess(res, null, 'Password has been reset successfully');
});
