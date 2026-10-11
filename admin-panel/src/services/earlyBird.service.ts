import { api } from './api';
import { ApiListResponse } from '@/types';

export type EarlyBirdType = 'REGISTER' | 'VOLUNTEER' | 'EXHIBIT' | 'PARTNER';

export const EARLY_BIRD_TYPES: { value: EarlyBirdType; label: string }[] = [
  { value: 'REGISTER', label: 'Register' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
  { value: 'EXHIBIT', label: 'Exhibit' },
  { value: 'PARTNER', label: 'Partner' },
];

export const AGE_GROUPS = ['Under 18', '18-24', '25-34', '35-44', '45-59', '60+'];

export const INTEREST_LABELS: Record<string, string> = {
  AUTHOR_TALKS: 'Author talks',
  KHASAKKINTE_ITHIHASAM: 'ഖസാക്കിന്റെ ഇതിഹാസം',
  MUSIC_EVENINGS: 'Music evenings',
  BOOK_FAIR: 'പുസ്തകമേള',
  OPEN_MIC_POETRY: 'Open mic & poetry',
  NEW_YEARS_EVE: "New Year's Eve",
  WORKSHOPS: 'Workshops',
  YOUTH: 'Youth',
  THEATRE: 'Theatre',
  MUSIC: 'Music',
  FILM: 'Film',
};

export interface EarlyBirdRegistration {
  id: string;
  interestType: EarlyBirdType;
  name: string;
  whatsappNumber: string;
  email: string | null;
  townOrCity: string;
  ageGroup: string;
  interests: string[];
  createdAt: string;
}

export interface EarlyBirdListParams {
  page?: number;
  limit?: number;
  search?: string;
  ageGroup?: string;
  interest?: string;
  interestType?: EarlyBirdType;
}

export async function listEarlyBird(
  params: EarlyBirdListParams
): Promise<ApiListResponse<EarlyBirdRegistration>> {
  const res = await api.get('/api/admin/early-bird', { params });
  return res.data;
}

export async function exportEarlyBirdCsv(params: Omit<EarlyBirdListParams, 'page' | 'limit'>): Promise<void> {
  const res = await api.get('/api/admin/early-bird/export', { params, responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `early-bird-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function deleteEarlyBird(id: string): Promise<void> {
  await api.delete(`/api/admin/early-bird/${id}`);
}
