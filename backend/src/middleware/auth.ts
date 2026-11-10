import { NextFunction, Request, Response } from 'express';
import { AdminRole } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  // Already authenticated by an earlier guard on the same request (see routes/admin/index.ts).
  if (req.admin) return next();

  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication token missing');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  if (payload.type !== 'access') {
    throw ApiError.unauthorized('Invalid token type');
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin || !admin.isActive) {
    throw ApiError.unauthorized('Admin account not found or inactive');
  }

  req.admin = { id: admin.id, email: admin.email, role: admin.role };

  // A temporary password only unlocks the change-password flow.
  if (admin.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.some((p) => req.originalUrl.split('?')[0].endsWith(p))) {
    throw ApiError.forbidden('You must change your temporary password before continuing');
  }
  next();
});

const PASSWORD_CHANGE_ALLOWED = ['/auth/me', '/auth/change-password', '/auth/logout'];

export function authorize(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) {
      throw ApiError.unauthorized();
    }
    if (roles.length > 0 && !roles.includes(req.admin.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  };
}

/**
 * Keeps gate-staff (SCANNER) accounts out of everything except the routes that
 * explicitly allow them. Mount after `authenticate`.
 */
export function denyScanner(req: Request, _res: Response, next: NextFunction) {
  if (req.admin?.role === 'SCANNER') {
    throw ApiError.forbidden('Scanner accounts can only verify and check in tickets');
  }
  next();
}
