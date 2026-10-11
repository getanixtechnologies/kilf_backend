import { z } from 'zod';

export const ENQUIRY_STATUSES = ['PENDING', 'IN_PROGRESS', 'RESOLVED'] as const;

// Strips HTML tags and control characters, then trims.
const clean = (v: string) =>
  v
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

const text = (min: number, max: number) => z.string().transform(clean).pipe(z.string().min(min).max(max));

const optionalText = (max: number) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().max(max))
    .optional()
    .transform((v) => v || undefined);

const email = z.string().trim().toLowerCase().pipe(z.string().email('Enter a valid email address').max(254));

const phone = z
  .string()
  .trim()
  .pipe(z.string().regex(/^\+?[\d\s\-()]{7,20}$/, 'Enter a valid phone number'))
  .transform((v) => v.replace(/[\s\-()]/g, ''));

export const createEnquirySchema = z.object({
  body: z.object({
    name: text(2, 100),
    email,
    phone,
    organisation: text(1, 150), // "Company / brand"
    topic: optionalText(100), // "Interested in"
    notes: optionalText(2000), // "Message"
  }),
});

const idParams = z.object({ id: z.string().uuid() });

export const enquiryIdParamSchema = z.object({ params: idParams });

export const listEnquiriesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(ENQUIRY_STATUSES).optional(),
    search: z.string().trim().max(100).optional(),
  }),
});

export const updateEnquiryStatusSchema = z.object({
  params: idParams,
  body: z.object({ status: z.enum(ENQUIRY_STATUSES) }),
});
