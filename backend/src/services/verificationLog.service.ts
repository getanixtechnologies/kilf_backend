import {
  Prisma,
  VerificationAction,
  VerificationMethod,
  VerificationOutcome,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { buildPagination } from '../utils/apiResponse';

export async function recordVerification(input: {
  adminId: string;
  ticketNumber: string;
  ticketInstanceId?: string | null;
  method?: VerificationMethod;
  action: VerificationAction;
  outcome: VerificationOutcome;
  message?: string;
}) {
  try {
    await prisma.verificationLog.create({
      data: {
        adminId: input.adminId,
        ticketNumber: input.ticketNumber,
        ticketInstanceId: input.ticketInstanceId ?? null,
        method: input.method ?? 'MANUAL',
        action: input.action,
        outcome: input.outcome,
        message: input.message ?? '',
      },
    });
  } catch (err) {
    // Logging must never block a gate check-in.
    logger.error({ err, input }, 'Failed to write verification log');
  }
}

export async function list(params: {
  page: number;
  limit: number;
  search?: string;
  adminId?: string;
  method?: VerificationMethod;
  action?: VerificationAction;
  outcome?: VerificationOutcome;
}) {
  const where: Prisma.VerificationLogWhereInput = {
    ...(params.adminId ? { adminId: params.adminId } : {}),
    ...(params.method ? { method: params.method } : {}),
    ...(params.action ? { action: params.action } : {}),
    ...(params.outcome ? { outcome: params.outcome } : {}),
    ...(params.search
      ? {
          OR: [
            { ticketNumber: { contains: params.search, mode: 'insensitive' } },
            { admin: { name: { contains: params.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.verificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: { admin: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.verificationLog.count({ where }),
  ]);
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}
