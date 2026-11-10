import { z } from 'zod';

export const createScannerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
    email: z.string().trim().email('A valid email is required'),
    /** Omit to generate a secure temporary password. */
    password: z.string().min(8, 'Password must be at least 8 characters long').optional(),
  }),
});

export const scannerIdSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid checker id') }),
});

export const updateScannerSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid checker id') }),
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters long').optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8, 'Password must be at least 8 characters long').optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
});
