import type { Prisma } from '@prisma/client';

/**
 * Ambil nomor urut berikutnya untuk sebuah kunci (misalnya "PO/CBG-JKT/202611").
 * Wajib dipanggil di dalam transaksi: baris counter terkunci sampai transaksi selesai,
 * sehingga dua request bersamaan tidak mendapat nomor yang sama.
 */
export async function nextNumber(tx: Prisma.TransactionClient, key: string): Promise<number> {
  await tx.$executeRaw`INSERT INTO document_counters (\`key\`, last_number) VALUES (${key}, 1)
    ON DUPLICATE KEY UPDATE last_number = last_number + 1`;
  const rows = await tx.$queryRaw<{ last_number: number }[]>`SELECT last_number FROM document_counters WHERE \`key\` = ${key}`;
  return Number(rows[0].last_number);
}

/** Format YYYYMM dari tanggal. */
export const yyyymm = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
