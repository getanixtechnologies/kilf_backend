import { api } from './api';
import { Admin } from '@/types';

export interface LoginResponse {
  token: string;
  refreshToken: string;
  admin: Admin;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post('/api/admin/auth/login', { email, password });
  // Login returns token/admin at the top level of the response, not nested under `data`.
  const { token, refreshToken, admin } = res.data;
  return { token, refreshToken, admin };
}

export async function logout(): Promise<void> {
  await api.post('/api/admin/auth/logout');
}

export async function getProfile(): Promise<Admin> {
  const res = await api.get('/api/admin/auth/me');
  return res.data.data;
}

/** Changing the password signs out other sessions and returns fresh tokens for this one. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<LoginResponse> {
  const res = await api.post('/api/admin/auth/change-password', { currentPassword, newPassword });
  return res.data.data;
}
