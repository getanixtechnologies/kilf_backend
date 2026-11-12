import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { getPaginationParams } from '../utils/pagination';
import * as guestBookingService from '../services/guestBooking.service';
import * as guestAuthService from '../services/guestAuth.service';
import { isProduction } from '../config/env';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, guest } = await guestAuthService.register(req.body);
  return res.status(201).json({
    success: true,
    token: accessToken,
    refreshToken,
    guest,
    message: 'Account created successfully',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, guest } = await guestAuthService.login(req.body);
  return res.status(200).json({
    success: true,
    token: accessToken,
    refreshToken,
    guest,
    message: 'Login successful',
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { accessToken, refreshToken } = await guestAuthService.refresh(req.body.refreshToken);
  return sendSuccess(res, { token: accessToken, refreshToken }, 'Token refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await guestAuthService.logout(req.guest!.id);
  return sendSuccess(res, null, 'Logged out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const guest = await guestAuthService.getProfile(req.guest!.id);
  return sendSuccess(res, guest, 'Profile fetched');
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const guest = await guestAuthService.updateProfile(req.guest!.id, req.body);
  return sendSuccess(res, guest, 'Profile updated');
});

export const myBookings = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const { bookings, total } = await guestBookingService.listGuestBookings(req.guest!.id, skip, limit);
  return sendSuccess(res, bookings, 'Bookings fetched', 200, buildPagination(page, limit, total));
});

export const myBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await guestBookingService.getGuestBooking(req.guest!.id, req.params.bookingNumber);
  return sendSuccess(res, booking, 'Booking fetched');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await guestAuthService.changePassword(req.guest!.id, req.body);
  return sendSuccess(res, null, 'Password changed successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const token = await guestAuthService.forgotPassword(req.body.email);
  return sendSuccess(
    res,
    isProduction ? null : { resetToken: token },
    'If that email is registered, a reset link has been sent'
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await guestAuthService.resetPassword(req.body.token, req.body.newPassword);
  return sendSuccess(res, null, 'Password has been reset successfully');
});
