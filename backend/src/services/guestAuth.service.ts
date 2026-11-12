import { randomBytes, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  signGuestAccessToken,
  signGuestRefreshToken,
  verifyGuestRefreshToken,
} from '../utils/jwt';
import {
  GuestChangePasswordInput,
  GuestLoginInput,
  GuestRegisterInput,
  GuestUpdateProfileInput,
} from '../validators/guestAuth.validator';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toGuestDto(guest: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    phone: guest.phone ?? null,
    isActive: guest.isActive,
    lastLoginAt: guest.lastLoginAt,
    createdAt: guest.createdAt,
  };
}

export async function register(input: GuestRegisterInput) {
  const email = input.email.toLowerCase();
  const existing = await prisma.guest.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  let guest;
  try {
    guest = await prisma.guest.create({
      data: { name: input.name, email, passwordHash },
    });
  } catch (err) {
    // Lost a race with a concurrent registration for the same email.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw err;
  }

  const accessToken = signGuestAccessToken(guest);
  const refreshToken = signGuestRefreshToken(guest);
  await prisma.guest.update({
    where: { id: guest.id },
    data: { refreshTokenHash: hashToken(refreshToken), lastLoginAt: new Date() },
  });

  return { accessToken, refreshToken, guest: toGuestDto(guest) };
}

export async function login(input: GuestLoginInput) {
  const guest = await prisma.guest.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!guest || !guest.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const valid = await verifyPassword(guest.passwordHash, input.password);
  if (!valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const accessToken = signGuestAccessToken(guest);
  const refreshToken = signGuestRefreshToken(guest);
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: { lastLoginAt: new Date(), refreshTokenHash: hashToken(refreshToken) },
  });

  return { accessToken, refreshToken, guest: toGuestDto(updated) };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyGuestRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (payload.type !== 'guest_refresh') {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const guest = await prisma.guest.findUnique({ where: { id: payload.sub } });
  if (!guest || !guest.isActive || guest.refreshTokenHash !== hashToken(refreshToken)) {
    throw ApiError.unauthorized('Refresh token is no longer valid');
  }

  const accessToken = signGuestAccessToken(guest);
  const newRefreshToken = signGuestRefreshToken(guest);
  await prisma.guest.update({
    where: { id: guest.id },
    data: { refreshTokenHash: hashToken(newRefreshToken) },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(guestId: string) {
  await prisma.guest.update({ where: { id: guestId }, data: { refreshTokenHash: null } });
}

export async function getProfile(guestId: string) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw ApiError.notFound('Account not found');
  return toGuestDto(guest);
}

/** Name and phone only; email is not editable. */
export async function updateProfile(guestId: string, input: GuestUpdateProfileInput) {
  const data: { name: string; phone?: string | null } = { name: input.name };
  if (input.phone !== undefined) data.phone = input.phone || null;
  const guest = await prisma.guest.update({ where: { id: guestId }, data });
  return toGuestDto(guest);
}

export async function changePassword(guestId: string, input: GuestChangePasswordInput) {
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) throw ApiError.notFound('Account not found');

  const valid = await verifyPassword(guest.passwordHash, input.currentPassword);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  if (input.currentPassword === input.newPassword) {
    throw ApiError.badRequest('New password must be different from the current password');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.guest.update({
    where: { id: guestId },
    data: { passwordHash, refreshTokenHash: null },
  });
}

/**
 * Issues a password reset token. Returns null (without error) when the email
 * is unknown so the endpoint cannot be used to enumerate accounts. The token
 * is only exposed in non-production responses; production should email it.
 */
export async function forgotPassword(email: string): Promise<string | null> {
  const guest = await prisma.guest.findUnique({ where: { email: email.toLowerCase() } });
  if (!guest || !guest.isActive) return null;

  const rawToken = randomBytes(32).toString('hex');
  await prisma.guest.update({
    where: { id: guest.id },
    data: {
      passwordResetToken: hashToken(rawToken),
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return rawToken;
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const guest = await prisma.guest.findFirst({
    where: { passwordResetToken: hashToken(rawToken), passwordResetExpires: { gt: new Date() } },
  });
  if (!guest) {
    throw ApiError.badRequest('Password reset token is invalid or has expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.guest.update({
    where: { id: guest.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      refreshTokenHash: null,
    },
  });
}
