import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Hilangkan field sensitif sebelum disimpan ke audit log. */
function sanitize(data: unknown): Prisma.InputJsonValue | undefined {
  if (data === undefined || data === null) return undefined;
  const json = JSON.parse(
    JSON.stringify(data, (k, v) => (k === 'passwordHash' || k === 'password' ? undefined : v)),
  );
  return json as Prisma.InputJsonValue;
}

export async function audit(
  req: Request,
  entry: { aksi: string; modul: string; refId?: string | number; dataLama?: unknown; dataBaru?: unknown },
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      userId: req.user?.id ?? null,
      namaUser: req.user?.nama ?? 'SYSTEM',
      aksi: entry.aksi,
      modul: entry.modul,
      refId: entry.refId !== undefined ? String(entry.refId) : null,
      dataLama: sanitize(entry.dataLama),
      dataBaru: sanitize(entry.dataBaru),
      ipAddress: req.ip ?? null,
    },
  });
}
