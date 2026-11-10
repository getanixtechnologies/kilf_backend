import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyGuestAccessToken } from '../utils/jwt';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

async function resolveGuest(header: string) {
  let payload;
  try {
    payload = verifyGuestAccessToken(header.slice('Bearer '.length).trim());
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  if (payload.type !== 'guest_access') {
    throw ApiError.unauthorized('Invalid token type');
  }

  const guest = await prisma.guest.findUnique({ where: { id: payload.sub } });
  if (!guest || !guest.isActive) {
    throw ApiError.unauthorized('Account not found or inactive');
  }
  return { id: guest.id, email: guest.email };
}

export const authenticateGuest = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token missing');
    }
    req.guest = await resolveGuest(header);
    next();
  }
);

/**
 * Attaches req.guest when a guest Bearer token is sent; requests without one
 * pass through untouched. A token that is sent but invalid/expired is a 401
 * so the client refreshes and retries instead of silently losing the link.
 */
export const optionalGuest = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      req.guest = await resolveGuest(header);
    }
    next();
  }
);
