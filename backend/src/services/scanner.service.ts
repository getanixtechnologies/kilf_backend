import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../utils/password';
import { toAdminDto } from './auth.service';
import { sendCheckerCredentials } from './email.service';

// No look-alike characters (0/O, 1/l/I) so it can be read off a phone and typed.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?';

/** A random 12-character password with upper, lower, digit and symbol. */
export function generateTemporaryPassword(): string {
  const pick = (set: string) => set[randomInt(0, set.length)];
  const all = UPPER + LOWER + DIGITS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function listScanners() {
  const scanners = await prisma.admin.findMany({
    where: { role: 'SCANNER' },
    orderBy: { createdAt: 'desc' },
  });
  return scanners.map(toAdminDto);
}

/**
 * Creates a checker (SCANNER) account with a temporary password (the one
 * given, or a generated one) that must be changed at first login, and emails
 * the credentials. The password is returned once so the admin can share it if
 * the email did not go out.
 */
export async function createScanner(input: { name: string; email: string; password?: string }) {
  const temporaryPassword = input.password || generateTemporaryPassword();
  let scanner;
  try {
    scanner = await prisma.admin.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(temporaryPassword),
        role: 'SCANNER',
        mustChangePassword: true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw err;
  }
  const emailSent = await sendCheckerCredentials({
    name: scanner.name,
    email: scanner.email,
    password: temporaryPassword,
  });
  return { scanner: toAdminDto(scanner), temporaryPassword, emailSent };
}

/** Issues a fresh temporary password, signs the checker out and emails it. */
export async function resendCredentials(id: string) {
  const existing = await prisma.admin.findFirst({ where: { id, role: 'SCANNER' } });
  if (!existing) throw ApiError.notFound('Checker not found');
  if (!existing.isActive) throw ApiError.badRequest('Reactivate this checker before resending credentials');

  const temporaryPassword = generateTemporaryPassword();
  const scanner = await prisma.admin.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      refreshTokenHash: null,
    },
  });
  const emailSent = await sendCheckerCredentials({
    name: scanner.name,
    email: scanner.email,
    password: temporaryPassword,
  });
  return { scanner: toAdminDto(scanner), temporaryPassword, emailSent };
}

export async function updateScanner(
  id: string,
  input: { name?: string; isActive?: boolean; password?: string }
) {
  const existing = await prisma.admin.findFirst({ where: { id, role: 'SCANNER' } });
  if (!existing) throw ApiError.notFound('Checker not found');

  const data: Prisma.AdminUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
    data.mustChangePassword = true;
  }
  // A new password or a deactivation signs the device out.
  if (input.password !== undefined || input.isActive === false) data.refreshTokenHash = null;

  return toAdminDto(await prisma.admin.update({ where: { id }, data }));
}
