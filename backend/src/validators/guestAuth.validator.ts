import { z } from 'zod';

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must be at most 72 characters long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const emailRule = z.string().trim().email('A valid email is required').max(254);

export const guestRegisterSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters long').max(100),
      email: emailRule,
      password: passwordRule,
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

export const guestLoginSchema = z.object({
  body: z.object({
    email: emailRule,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const guestRefreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const guestChangePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: passwordRule,
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

export const guestForgotPasswordSchema = z.object({
  body: z.object({ email: emailRule }),
});

export const guestResetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string().min(1, 'Reset token is required'),
      newPassword: passwordRule,
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
});

export const guestUpdateProfileSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters long')
      .max(100, 'Name must be at most 100 characters long'),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+ ]{10,15}$/, 'Phone must be 10-15 characters: digits, + or spaces')
      .nullable()
      .optional(),
  }),
});

export const guestBookingListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const guestBookingParamsSchema = z.object({
  params: z.object({ bookingNumber: z.string().trim().min(1).max(50) }),
});

export type GuestUpdateProfileInput = z.infer<typeof guestUpdateProfileSchema>['body'];
export type GuestRegisterInput = z.infer<typeof guestRegisterSchema>['body'];
export type GuestLoginInput = z.infer<typeof guestLoginSchema>['body'];
export type GuestChangePasswordInput = z.infer<typeof guestChangePasswordSchema>['body'];
