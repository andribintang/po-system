import type { Request } from 'express';
import { z } from 'zod';
import { HttpError } from './errors';

export function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID tidak valid');
  return id;
}

export const listQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

/** String kosong dari form diubah menjadi null. */
export const optStr = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Nominal uang: terima angka atau string, simpan sebagai string desimal 2 digit. */
export const money = z.coerce
  .number({ invalid_type_error: 'Harus berupa angka' })
  .min(0, 'Tidak boleh negatif')
  .max(9_999_999_999_999)
  .transform((n) => n.toFixed(2));
