import { EnquiryStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { buildPagination } from '../utils/apiResponse';

export async function create(data: {
  name: string;
  email: string;
  phone: string;
  organisation: string;
  topic?: string;
  notes?: string;
}) {
  return prisma.enquiry.create({ data, select: { id: true, status: true } });
}

export async function list(params: { page: number; limit: number; status?: EnquiryStatus; search?: string }) {
  const where: Prisma.EnquiryWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search } },
            { organisation: { contains: params.search, mode: 'insensitive' } },
            { notes: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.enquiry.count({ where }),
  ]);
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}

export async function getById(id: string) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id } });
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  return enquiry;
}

export async function updateStatus(id: string, status: EnquiryStatus) {
  await getById(id);
  return prisma.enquiry.update({ where: { id }, data: { status } });
}

export async function remove(id: string) {
  const before = await getById(id);
  await prisma.enquiry.delete({ where: { id } });
  return before;
}
