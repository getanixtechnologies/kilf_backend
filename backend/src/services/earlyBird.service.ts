import { EarlyBirdType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { buildPagination } from '../utils/apiResponse';
import { toCsv } from '../utils/csv';

export interface EarlyBirdFilters {
  search?: string;
  ageGroup?: string;
  interest?: string;
  interestType?: EarlyBirdType;
}

export async function register(data: {
  name: string;
  whatsappNumber: string;
  email?: string;
  townOrCity: string;
  ageGroup: string;
  interests: string[];
  interestType?: EarlyBirdType;
}) {
  try {
    return await prisma.earlyBirdRegistration.create({
      data: { ...data, interests: [...new Set(data.interests)] },
      select: { id: true, name: true, createdAt: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('This WhatsApp number is already registered');
    }
    throw err;
  }
}

function buildWhere({ search, ageGroup, interest, interestType }: EarlyBirdFilters): Prisma.EarlyBirdRegistrationWhereInput {
  return {
    ...(ageGroup ? { ageGroup } : {}),
    ...(interestType ? { interestType } : {}),
    ...(interest ? { interests: { has: interest } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { whatsappNumber: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { townOrCity: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function list(params: EarlyBirdFilters & { page: number; limit: number }) {
  const where = buildWhere(params);
  const [items, total] = await Promise.all([
    prisma.earlyBirdRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.earlyBirdRegistration.count({ where }),
  ]);
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}

export async function exportCsv(filters: EarlyBirdFilters) {
  const rows = await prisma.earlyBirdRegistration.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: 'desc' },
  });
  return toCsv(
    rows.map((r) => ({
      ...r,
      interests: r.interests.join('; '),
      createdAt: r.createdAt.toISOString(),
    })),
    ['interestType', 'name', 'whatsappNumber', 'email', 'townOrCity', 'ageGroup', 'interests', 'createdAt']
  );
}

export async function remove(id: string) {
  const before = await prisma.earlyBirdRegistration.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Registration not found');
  await prisma.earlyBirdRegistration.delete({ where: { id } });
  return before;
}
