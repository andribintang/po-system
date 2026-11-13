import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { HttpError, forbidden } from '../lib/errors';

export const COOKIE_NAME = 'po_token';

export interface AuthUser {
  id: number;
  nama: string;
  email: string;
  role: UserRole;
  branchId: number | null;
  employeeId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: number;
  ver: number;
}

export function signToken(userId: number, tokenVersion: number) {
  return jwt.sign({ sub: userId, ver: tokenVersion } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies?.[COOKIE_NAME] as string | undefined) ?? null;
}

/** Wajib login. Token diverifikasi dan user dicek ulang ke database setiap request. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Silakan login terlebih dahulu');
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as unknown as TokenPayload;
    } catch {
      throw new HttpError(401, 'Sesi berakhir, silakan login ulang');
    }
    const user = await prisma.user.findFirst({
      where: { id: Number(payload.sub), deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.ver) {
      throw new HttpError(401, 'Sesi tidak valid, silakan login ulang');
    }
    req.user = {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      employeeId: user.employeeId,
    };
    next();
  } catch (e) {
    next(e);
  }
}

/** Batasi endpoint ke role tertentu. */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Silakan login terlebih dahulu'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Cabang yang boleh diakses user. NULL = semua cabang (SUPER_ADMIN). */
export function branchScope(user: AuthUser): number | null {
  return user.role === 'SUPER_ADMIN' ? null : user.branchId;
}
