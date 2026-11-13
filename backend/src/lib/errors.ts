import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Data') => new HttpError(404, `${what} tidak ditemukan`);
export const forbidden = () => new HttpError(403, 'Anda tidak memiliki akses untuk aksi ini');

/** Bungkus handler async agar error diteruskan ke error handler Express. */
export const ah =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as T, res, next).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Data tidak valid', details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string | string[] | undefined) ?? '';
      return res.status(409).json({ error: `Data duplikat pada kolom unik: ${String(target)}` });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: 'Data tidak ditemukan' });
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'Data masih terhubung dengan data lain (relasi)' });
    }
  }
  console.error(err);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
}
