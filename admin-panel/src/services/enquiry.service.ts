import { api } from './api';
import { ApiItemResponse, ApiListResponse } from '@/types';

export type EnquiryStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export const ENQUIRY_STATUSES: { value: EnquiryStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
];

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  organisation: string;
  topic: string | null;
  notes: string | null;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EnquiryListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: EnquiryStatus;
}

export async function listEnquiries(params: EnquiryListParams): Promise<ApiListResponse<Enquiry>> {
  const res = await api.get('/api/admin/enquiries', { params });
  return res.data;
}

export async function updateEnquiryStatus(id: string, status: EnquiryStatus): Promise<Enquiry> {
  const res = await api.patch<ApiItemResponse<Enquiry>>(`/api/admin/enquiries/${id}/status`, { status });
  return res.data.data;
}

export async function deleteEnquiry(id: string): Promise<void> {
  await api.delete(`/api/admin/enquiries/${id}`);
}
