import { z } from 'zod';
import { isValidTimeZone } from '../utils/istDate';

const FestivalStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']);

export const createFestivalSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(200),
      description: z.string().max(5000).optional(),
      location: z.string().max(255).optional(),
      venue: z.string().max(255).optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      registrationStart: z.coerce.date().optional(),
      registrationEnd: z.coerce.date().optional(),
      bannerImage: z.string().url().optional().or(z.literal('')),
      status: FestivalStatusEnum.optional(),
      timezone: z.string().refine(isValidTimeZone, 'Invalid IANA timezone').optional(),
    })
    .refine((data) => data.endDate >= data.startDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    }),
});

export const updateFestivalSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).max(200).optional(),
    description: z.string().max(5000).optional(),
    location: z.string().max(255).optional(),
    venue: z.string().max(255).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    registrationStart: z.coerce.date().optional(),
    registrationEnd: z.coerce.date().optional(),
    bannerImage: z.string().url().optional().or(z.literal('')),
    status: FestivalStatusEnum.optional(),
    timezone: z.string().refine(isValidTimeZone, 'Invalid IANA timezone').optional(),
  }),
});

export const festivalIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listFestivalsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    status: FestivalStatusEnum.optional(),
    search: z.string().optional(),
    sortBy: z.enum(['name', 'startDate', 'endDate', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const updateFestivalStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ status: FestivalStatusEnum }),
});
