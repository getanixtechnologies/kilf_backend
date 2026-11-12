import { FestivalStatus } from '@prisma/client';
import * as festivalRepository from '../repositories/festival.repository';
import { ApiError } from '../utils/ApiError';
import { buildPagination } from '../utils/apiResponse';

export interface ListFestivalsParams {
  page: number;
  limit: number;
  status?: FestivalStatus;
  search?: string;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export async function listFestivals(params: ListFestivalsParams) {
  const skip = (params.page - 1) * params.limit;
  const { items, total } = await festivalRepository.findMany({
    status: params.status,
    search: params.search,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    skip,
    take: params.limit,
  });
  return { items, pagination: buildPagination(params.page, params.limit, total) };
}

export async function getFestival(id: string) {
  const festival = await festivalRepository.findById(id);
  if (!festival) throw ApiError.notFound('Festival not found');
  return festival;
}

export async function createFestival(data: {
  name: string;
  description?: string;
  location?: string;
  venue?: string;
  startDate: Date;
  endDate: Date;
  registrationStart?: Date;
  registrationEnd?: Date;
  bannerImage?: string;
  status?: FestivalStatus;
  timezone?: string;
}) {
  return festivalRepository.create({
    name: data.name,
    description: data.description,
    location: data.location,
    venue: data.venue,
    startDate: data.startDate,
    endDate: data.endDate,
    registrationStart: data.registrationStart,
    registrationEnd: data.registrationEnd,
    bannerImage: data.bannerImage || undefined,
    status: data.status ?? 'DRAFT',
    timezone: data.timezone,
  });
}

export async function updateFestival(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    location: string;
    venue: string;
    startDate: Date;
    endDate: Date;
    registrationStart: Date;
    registrationEnd: Date;
    bannerImage: string;
    status: FestivalStatus;
    timezone: string;
  }>
) {
  await getFestival(id);
  return festivalRepository.update(id, data);
}

export async function deleteFestival(id: string) {
  await getFestival(id);
  return festivalRepository.remove(id);
}

export async function updateStatus(id: string, status: FestivalStatus) {
  await getFestival(id);
  return festivalRepository.update(id, { status });
}
