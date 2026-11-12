import { api } from './api';
import { Admin } from '@/types';

/** Checker accounts are stored with the backend role SCANNER. */
export interface CheckerCredentialsResult {
  scanner: Admin;
  /** Shown once so the admin can pass it on if the email did not go out. */
  temporaryPassword: string;
  emailSent: boolean;
}

export async function listScanners(): Promise<Admin[]> {
  const res = await api.get('/api/admin/scanners');
  return res.data.data;
}

/** Leave `password` empty to have the server generate a secure temporary one. */
export async function createScanner(input: {
  name: string;
  email: string;
  password?: string;
}): Promise<CheckerCredentialsResult> {
  const res = await api.post('/api/admin/scanners', input);
  return res.data.data;
}

export async function resendScannerCredentials(id: string): Promise<CheckerCredentialsResult> {
  const res = await api.post(`/api/admin/scanners/${id}/resend-credentials`);
  return res.data.data;
}

export async function updateScanner(
  id: string,
  input: { name?: string; isActive?: boolean; password?: string }
): Promise<Admin> {
  const res = await api.patch(`/api/admin/scanners/${id}`, input);
  return res.data.data;
}
