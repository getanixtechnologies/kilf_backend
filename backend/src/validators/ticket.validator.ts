import { z } from 'zod';

const TicketTypeEnum = z.enum([
  'GENERAL',
  'VIP',
  'STUDENT',
  'EARLY_BIRD',
  'DAY_PASS',
  'FULL_FESTIVAL',
  'YOUNG_READER',
  'ELITE',
  'KHASAK_SHOW',
  'NEW_YEAR_EVE',
]);
const TicketSaleStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

const passRuleFields = {
  gstRate: z.coerce.number().min(0).max(100).optional(),
  requiresDate: z.boolean().optional(),
  requiresShowSession: z.boolean().optional(),
  minAge: z.coerce.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.coerce.number().int().min(0).max(120).nullable().optional(),
  multiDay: z.boolean().optional(),
  perks: z.array(z.string().min(1).max(200)).max(20).optional(),
};

export const createTicketSchema = z.object({
  body: z
    .object({
      festivalId: z.string().uuid().optional(),
      name: z.string().min(2).max(200),
      description: z.string().max(2000).optional(),
      ticketType: TicketTypeEnum.default('GENERAL'),
      price: z.coerce.number().nonnegative(),
      totalQuantity: z.coerce.number().int().positive(),
      salesStart: z.coerce.date(),
      salesEnd: z.coerce.date(),
      status: TicketSaleStatusEnum.optional(),
      ...passRuleFields,
    })
    .refine((d) => d.salesEnd > d.salesStart, {
      message: 'salesEnd must be after salesStart',
      path: ['salesEnd'],
    }),
});

export const updateTicketSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).max(200).optional(),
    description: z.string().max(2000).optional(),
    ticketType: TicketTypeEnum.optional(),
    price: z.coerce.number().nonnegative().optional(),
    totalQuantity: z.coerce.number().int().positive().optional(),
    salesStart: z.coerce.date().optional(),
    salesEnd: z.coerce.date().optional(),
    status: TicketSaleStatusEnum.optional(),
    ...passRuleFields,
  }),
});

export const ticketIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listTicketsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    festivalId: z.string().uuid().optional(),
    status: TicketSaleStatusEnum.optional(),
    ticketType: TicketTypeEnum.optional(),
    search: z.string().optional(),
  }),
});

export const updateTicketStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ status: TicketSaleStatusEnum }),
});

export const publicListTicketsSchema = z.object({
  query: z.object({
    festivalId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

export const publicTicketIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
