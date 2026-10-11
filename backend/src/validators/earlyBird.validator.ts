import { z } from 'zod';

export const AGE_GROUPS = ['Under 18', '18-24', '25-34', '35-44', '45-59', '60+'] as const;

export const INTERESTS = [
  'AUTHOR_TALKS',
  'KHASAKKINTE_ITHIHASAM',
  'MUSIC_EVENINGS',
  'BOOK_FAIR',
  'OPEN_MIC_POETRY',
  'NEW_YEARS_EVE',
  'WORKSHOPS',
  'YOUTH',
  'THEATRE',
  'MUSIC',
  'FILM',
] as const;

export const INTEREST_TYPES = ['REGISTER', 'VOLUNTEER', 'EXHIBIT', 'PARTNER'] as const;

// Indian mobile number; accepts "98765 43210", "+91 98765 43210", "09876543210".
const whatsappNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit WhatsApp number');

export const createEarlyBirdSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    whatsappNumber,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    townOrCity: z.string().trim().min(2).max(100),
    ageGroup: z.enum(AGE_GROUPS),
    interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).default([]),
    interestType: z.enum(INTEREST_TYPES).default('REGISTER'),
  }),
});

const filters = {
  search: z.string().trim().max(100).optional(),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  interest: z.enum(INTERESTS).optional(),
  interestType: z.enum(INTEREST_TYPES).optional(),
};

export const listEarlyBirdSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    ...filters,
  }),
});

export const exportEarlyBirdSchema = z.object({
  query: z.object(filters),
});

export const earlyBirdIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
