import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from './prisma';
import { HttpError, forbidden } from './errors';
import { optStr } from './http';
import { resolveFee, splitCashback } from './fees';
import { CLAIMABLE_STATUSES } from './poRules';
import { nextNumber } from './counter';
import { notify } from './notify';
import { audit } from './audit';
import type { AuthUser } from '../middleware/auth';

type Db = Prisma.TransactionClient | typeof prisma;

export const claimSchema = z
  .object({
    vendorId: z.coerce.number().int().positive(),
    periode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus YYYY-MM'),
    tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
    metodePengiriman: z.enum(['TRANSFER', 'CASH']),
    buktiFileId: z.coerce.number().int().positive().nullable().optional(),
    catatan: optStr(2000),
    /** Klaim berdasarkan PO: pasangan PO + cabang (PO multi cabang bisa diklaim per cabang). */
    poBranches: z
      .array(z.object({ poId: z.coerce.number().int().positive(), branchId: z.coerce.number().int().positive() }))
      .default([]),
    /** Klaim tanpa PO: diisi manual per cabang & produk (jumlah pcs). */
    manualLines: z
      .array(
        z.object({
          branchId: z.coerce.number().int().positive(),
          productId: z.coerce.number().int().positive(),
          qtyPcs: z.coerce.number().int().min(1).max(10_000_000),
        }),
      )
      .default([]),
  })
  .refine((d) => d.poBranches.length + d.manualLines.length > 0, { message: 'Pilih minimal satu PO atau isi baris manual' });
export type ClaimInput = z.infer<typeof claimSchema>;

export interface ClaimLine {
  poId: number | null;
  poNumber: string | null;
  branchId: number;
  branchName: string;
  areaName: string;
  productId: number;
  kodeProduk: string;
  namaProduk: string;
  qtyPcs: number;
  feeSource: 'AREA' | 'DEFAULT';
  feeVendorPerPcs: Prisma.Decimal;
  feeKabengPerPcs: Prisma.Decimal;
  feePerusahaanPerPcs: Prisma.Decimal;
  totalVendor: Prisma.Decimal;
  totalKabeng: Prisma.Decimal;
  totalPerusahaan: Prisma.Decimal;
}

const D0 = () => new Prisma.Decimal(0);

/** Admin cabang hanya boleh mengklaim untuk cabangnya. */
function assertBranch(user: AuthUser, branchId: number) {
  if (user.role === 'SUPER_ADMIN') return;
  if (user.role === 'ADMIN' && user.branchId === branchId) return;
  throw forbidden();
}

/**
 * Hitung baris klaim cashback dari PO dan/atau baris manual.
 * Tarif diambil per area cabang (atau default produk). Semua dihitung di server dengan Decimal.
 */
export async function computeClaim(user: AuthUser, d: Pick<ClaimInput, 'vendorId' | 'poBranches' | 'manualLines'>, db: Db = prisma) {
  const vendor = await db.vendor.findFirst({ where: { id: d.vendorId, deletedAt: null } });
  if (!vendor) throw new HttpError(400, 'Vendor tidak ditemukan');

  const seenPair = new Set<string>();
  for (const pb of d.poBranches) {
    const k = `${pb.poId}-${pb.branchId}`;
    if (seenPair.has(k)) throw new HttpError(400, 'Ada PO + cabang yang dipilih dua kali');
    seenPair.add(k);
    assertBranch(user, pb.branchId);
  }
  d.manualLines.forEach((l) => assertBranch(user, l.branchId));

  const poIds = [...new Set(d.poBranches.map((p) => p.poId))];
  const pos = await db.purchaseOrder.findMany({
    where: { id: { in: poIds }, deletedAt: null },
    include: { details: true, receiptPOs: true },
  });
  const poMap = new Map(pos.map((p) => [p.id, p]));

  // Kumpulkan (poId, branchId, productId, qtyPcs) mentah.
  const raw: { poId: number | null; poNumber: string | null; branchId: number; productId: number; qtyPcs: number }[] = [];
  for (const pb of d.poBranches) {
    const po = poMap.get(pb.poId);
    if (!po) throw new HttpError(400, `PO #${pb.poId} tidak ditemukan`);
    if (po.vendorId !== d.vendorId) throw new HttpError(400, `${po.poNumber} bukan PO vendor ${vendor.namaVendor}`);
    if (!CLAIMABLE_STATUSES.includes(po.status)) {
      throw new HttpError(400, `${po.poNumber} belum bisa diklaim (status harus minimal Approved)`);
    }
    if (po.receiptPOs.some((r) => r.branchId === pb.branchId)) {
      throw new HttpError(409, `${po.poNumber} untuk cabang ini sudah pernah diklaim`);
    }
    const lines = po.details.filter((x) => x.branchId === pb.branchId);
    if (!lines.length) throw new HttpError(400, `${po.poNumber} tidak memuat cabang yang dipilih`);
    for (const l of lines) raw.push({ poId: po.id, poNumber: po.poNumber, branchId: l.branchId, productId: l.productId, qtyPcs: l.totalPcs });
  }
  for (const m of d.manualLines) raw.push({ poId: null, poNumber: null, ...m });

  const branchIds = [...new Set(raw.map((r) => r.branchId))];
  const productIds = [...new Set(raw.map((r) => r.productId))];
  const [branches, products] = await Promise.all([
    db.branch.findMany({ where: { id: { in: branchIds }, deletedAt: null }, include: { area: true } }),
    db.product.findMany({ where: { id: { in: productIds }, deletedAt: null }, include: { areaFees: true } }),
  ]);
  const bMap = new Map(branches.map((b) => [b.id, b]));
  const pMap = new Map(products.map((p) => [p.id, p]));

  // Gabungkan baris dengan kunci sama (PO, cabang, produk).
  const merged = new Map<string, (typeof raw)[number]>();
  for (const r of raw) {
    const k = `${r.poId ?? 'M'}-${r.branchId}-${r.productId}`;
    const ex = merged.get(k);
    if (ex) ex.qtyPcs += r.qtyPcs;
    else merged.set(k, { ...r });
  }

  const lines: ClaimLine[] = [];
  for (const r of merged.values()) {
    const b = bMap.get(r.branchId);
    const p = pMap.get(r.productId);
    if (!b) throw new HttpError(400, `Cabang #${r.branchId} tidak ditemukan`);
    if (!p) throw new HttpError(400, `Produk #${r.productId} tidak ditemukan`);
    if (p.vendorId !== d.vendorId) throw new HttpError(400, `Produk ${p.kodeProduk} bukan dari vendor ${vendor.namaVendor}`);
    const fee = resolveFee(p, b.areaId);
    const s = splitCashback(fee, r.qtyPcs);
    lines.push({
      poId: r.poId,
      poNumber: r.poNumber,
      branchId: b.id,
      branchName: b.namaCabang,
      areaName: b.area.namaArea,
      productId: p.id,
      kodeProduk: p.kodeProduk,
      namaProduk: p.namaProduk,
      qtyPcs: r.qtyPcs,
      feeSource: fee.source,
      feeVendorPerPcs: fee.feeVendorPerPcs,
      feeKabengPerPcs: fee.feeKabengPerPcs,
      feePerusahaanPerPcs: fee.feePerusahaanPerPcs,
      totalVendor: s.totalVendor,
      totalKabeng: s.totalKabeng,
      totalPerusahaan: s.totalPerusahaan,
    });
  }

  const totals = lines.reduce(
    (a, l) => ({
      qtyPcs: a.qtyPcs + l.qtyPcs,
      vendor: a.vendor.add(l.totalVendor),
      kabeng: a.kabeng.add(l.totalKabeng),
      perusahaan: a.perusahaan.add(l.totalPerusahaan),
    }),
    { qtyPcs: 0, vendor: D0(), kabeng: D0(), perusahaan: D0() },
  );
  return { vendor, lines, totals };
}

/** Simpan klaim: header, PO terklaim, detail, dan distribusi UNPAID dalam satu transaksi. */
export async function createClaim(req: Request, d: ClaimInput, tx: Prisma.TransactionClient) {
  const user = req.user!;
  // Kunci PO yang diklaim agar dua klaim bersamaan tidak lolos validasi bersamaan.
  const poIds = [...new Set(d.poBranches.map((p) => p.poId))];
  if (poIds.length) await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id IN (${Prisma.join(poIds)}) FOR UPDATE`;

  const { lines, totals } = await computeClaim(user, d, tx);
  if (d.buktiFileId) {
    const f = await tx.fileUpload.findUnique({ where: { id: d.buktiFileId } });
    if (!f) throw new HttpError(400, 'File bukti tidak ditemukan');
  }

  const ym = d.periode.replace('-', '');
  const seq = await nextNumber(tx, `CB/${ym}`);
  const receiptNo = `CB/${ym}/${String(seq).padStart(4, '0')}`;

  const receipt = await tx.cashbackReceipt.create({
    data: {
      receiptNo,
      vendorId: d.vendorId,
      periode: d.periode,
      tanggal: new Date(`${d.tanggal}T00:00:00Z`),
      metodePengiriman: d.metodePengiriman,
      totalCashback: totals.vendor,
      buktiFileId: d.buktiFileId ?? null,
      catatan: d.catatan,
      createdById: user.id,
      // Unik (po_id, branch_id): klaim dobel ditolak oleh database.
      pos: { create: d.poBranches.map((p) => ({ poId: p.poId, branchId: p.branchId })) },
      details: {
        create: lines.map((l) => ({
          poId: l.poId,
          productId: l.productId,
          branchId: l.branchId,
          qtyPcs: l.qtyPcs,
          feeVendorPerPcs: l.feeVendorPerPcs,
          totalFee: l.totalVendor,
        })),
      },
      distributions: {
        create: lines.map((l) => ({
          periode: d.periode,
          poId: l.poId,
          branchId: l.branchId,
          productId: l.productId,
          qtyPcs: l.qtyPcs,
          feeKabengPerPcs: l.feeKabengPerPcs,
          totalFeeKabeng: l.totalKabeng,
          feePerusahaanPerPcs: l.feePerusahaanPerPcs,
          totalFeePerusahaan: l.totalPerusahaan,
          status: 'UNPAID',
        })),
      },
    },
  });

  // Satu notifikasi per cabang, agar Admin & Kepala Bengkel cabang itu tahu ada hak cashback baru.
  const perBranch = new Map<number, { name: string; kabeng: Prisma.Decimal }>();
  for (const l of lines) {
    const x = perBranch.get(l.branchId) ?? { name: l.branchName, kabeng: D0() };
    x.kabeng = x.kabeng.add(l.totalKabeng);
    perBranch.set(l.branchId, x);
  }
  for (const [branchId, x] of perBranch) {
    await notify(tx, {
      type: 'CASHBACK_RECEIVED',
      title: `Cashback diterima ${receiptNo}`,
      message: `Cashback periode ${d.periode} untuk ${x.name}: hak Kepala Bengkel Rp ${x.kabeng.toFixed(0)}`,
      refType: 'CASHBACK',
      refId: receipt.id,
      branchId,
    });
  }
  await audit(req, { aksi: 'CREATE_CASHBACK', modul: 'CASHBACK', refId: receiptNo, dataBaru: { ...receipt, lines } }, tx);
  return receipt;
}
