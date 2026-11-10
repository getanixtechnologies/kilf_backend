import { randomBytes, createHash } from 'crypto';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { LoginInput, ChangePasswordInput } from '../validators/auth.validator';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAdminDto(admin: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  mustChangePassword?: boolean;
}) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    mustChangePassword: admin.mustChangePassword ?? false,
  };
}

/**
 * Creates the very first admin account (as SUPER_ADMIN). Only succeeds when
 * no admin exists yet - guarded by a Postgres advisory lock so two
 * concurrent bootstrap requests (e.g. two browser tabs on first setup)
 * can't both slip past the `admin.count() === 0` check and create two
 * "first" admins.
 */
export async function bootstrapAdmin(input: { name: string; email: string; password: string }) {
  const admin = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kilf_bootstrap_admin'))`;

    const existingCount = await tx.admin.count();
    if (existingCount > 0) {
      throw ApiError.forbidden('An admin account already exists; bootstrap is disabled');
    }

    const passwordHash = await hashPassword(input.password);
    return tx.admin.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    });
  });

  const accessToken = signAccessToken(admin);
  const refreshToken = signRefreshToken(admin);
  await prisma.admin.update({
    where: { id: admin.id },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });

  return { accessToken, refreshToken, admin: toAdminDto(admin) };
}

export async function login(input: LoginInput) {
  const admin = await prisma.admin.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!admin || !admin.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const validPassword = await verifyPassword(admin.passwordHash, input.password);
  if (!validPassword) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const accessToken = signAccessToken(admin);
  const refreshToken = signRefreshToken(admin);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date(), refreshTokenHash: hashToken(refreshToken) },
  });

  return { accessToken, refreshToken, admin: toAdminDto(admin) };
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin || !admin.isActive || admin.refreshTokenHash !== hashToken(refreshToken)) {
    throw ApiError.unauthorized('Refresh token is no longer valid');
  }

  const accessToken = signAccessToken(admin);
  const newRefreshToken = signRefreshToken(admin);
  await prisma.admin.update({
    where: { id: admin.id },
    data: { refreshTokenHash: hashToken(newRefreshToken) },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(adminId: string) {
  await prisma.admin.update({
    where: { id: adminId },
    data: { refreshTokenHash: null },
  });
}

export async function getProfile(adminId: string) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw ApiError.notFound('Admin not found');
  return toAdminDto(admin);
}

export async function changePassword(adminId: string, input: ChangePasswordInput) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw ApiError.notFound('Admin not found');

  const valid = await verifyPassword(admin.passwordHash, input.currentPassword);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');
  if (input.currentPassword === input.newPassword) {
    throw ApiError.badRequest('New password must be different from the current one');
  }

  // Other sessions are signed out; this one gets fresh tokens so it can carry on.
  const passwordHash = await hashPassword(input.newPassword);
  const refreshToken = signRefreshToken(admin);
  const updated = await prisma.admin.update({
    where: { id: adminId },
    data: { passwordHash, refreshTokenHash: hashToken(refreshToken), mustChangePassword: false },
  });
  return { token: signAccessToken(updated), refreshToken, admin: toAdminDto(updated) };
}

/**
 * Issues a password reset token. Always returns the same shape whether or
 * not the email exists, to avoid leaking which emails are registered.
 * In production this token would be emailed to the admin; here it is
 * returned only in non-production responses (see auth.controller.ts).
 */
export async function forgotPassword(email: string): Promise<string | null> {
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin) return null;

  const rawToken = randomBytes(32).toString('hex');
  const passwordResetToken = hashToken(rawToken);
  const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.admin.update({
    where: { id: admin.id },
    data: { passwordResetToken, passwordResetExpires },
  });

  return rawToken;
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const passwordResetToken = hashToken(rawToken);
  const admin = await prisma.admin.findFirst({
    where: { passwordResetToken, passwordResetExpires: { gt: new Date() } },
  });

  if (!admin) {
    throw ApiError.badRequest('Password reset token is invalid or has expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      refreshTokenHash: null,
      mustChangePassword: false,
    },
  });
}
